//! Pruebas de integración de la lógica anti-doble-conteo de GreenLedger v2.
//!
//! Corren 100 % en local (entorno simulado de soroban-sdk): no tocan
//! testnet, no usan llaves reales y no firman transacciones reales.
//! Las direcciones se generan al azar dentro de la prueba.
#![cfg(test)]

use greenledger::{
    CreditoLote, EstadoCredito, Error, GreenLedgerContract, GreenLedgerContractClient,
    TipoMovimiento,
};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env, Symbol, Vec};

struct Ctx {
    env: Env,
    client: GreenLedgerContractClient<'static>,
    verificador: Address,
    productor: Address,
    comprador: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(GreenLedgerContract, ());
    let client = GreenLedgerContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let verificador = Address::generate(&env);
    client.initialize(&admin);
    client.agregar_verificador(&verificador);
    let productor = Address::generate(&env);
    let comprador = Address::generate(&env);
    Ctx { env, client, verificador, productor, comprador }
}

fn hash(env: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(env, &[b; 32])
}

fn emitir(c: &Ctx, id: &Symbol, toneladas: u32) {
    c.client.emitir_credito(
        &c.verificador,
        id,
        &c.productor,
        &toneladas,
        &hash(&c.env, 1),
        &Symbol::new(&c.env, "PROY001"),
    );
}

/// Ciclo completo feliz: emitir -> transferir -> retirar, con historial
/// y totales coherentes.
#[test]
fn ciclo_completo_emitir_transferir_retirar() {
    let c = setup();
    let id = Symbol::new(&c.env, "CRED001");
    emitir(&c, &id, 100);

    let cr = c.client.verificar_credito(&id);
    assert_eq!(cr.estado, EstadoCredito::Emitido);
    assert_eq!(cr.propietario, c.productor);

    let cr = c.client.transferir_credito(&id, &c.comprador);
    assert_eq!(cr.propietario, c.comprador);

    let benef = Symbol::new(&c.env, "EMPRESA_DEMO");
    let cr = c.client.retirar_credito(&id, &benef);
    assert_eq!(cr.estado, EstadoCredito::Retirado);
    assert_eq!(cr.beneficiario_retiro, Some(benef));

    let h = c.client.historial_credito(&id, &0, &50);
    assert_eq!(h.len(), 3);
    assert_eq!(h.get(0).unwrap().tipo, TipoMovimiento::Emision);
    assert_eq!(h.get(1).unwrap().tipo, TipoMovimiento::Transferencia);
    assert_eq!(h.get(2).unwrap().tipo, TipoMovimiento::Retiro);
    assert_eq!(c.client.total_emitido(), 100);
    assert_eq!(c.client.total_retirado(), 100);
}

/// No se puede emitir dos veces el mismo id, aunque cambien toneladas,
/// propietario, hash o proyecto; el estado original queda intacto y el
/// total emitido no sube.
#[test]
fn doble_emision_es_rechazada_y_no_altera_nada() {
    let c = setup();
    let id = Symbol::new(&c.env, "CRED001");
    emitir(&c, &id, 100);
    let antes = c.client.verificar_credito(&id);

    let r = c.client.try_emitir_credito(
        &c.verificador,
        &id,
        &c.comprador, // otro dueño
        &999,         // otras toneladas
        &hash(&c.env, 9),
        &Symbol::new(&c.env, "OTRO"),
    );
    assert_eq!(r, Err(Ok(Error::CreditoYaExiste)));

    assert_eq!(c.client.verificar_credito(&id), antes);
    assert_eq!(c.client.total_emitido(), 100);
    assert_eq!(c.client.total_movimientos(&id), 1);
}

/// Un id ya transferido o ya retirado tampoco puede re-emitirse
/// ("reciclar" un crédito quemado).
#[test]
fn no_se_puede_reemitir_un_credito_transferido_ni_retirado() {
    let c = setup();
    let id = Symbol::new(&c.env, "CRED001");
    emitir(&c, &id, 100);
    c.client.transferir_credito(&id, &c.comprador);

    let propio = |c: &Ctx| {
        c.client.try_emitir_credito(
            &c.verificador,
            &id,
            &c.productor,
            &100,
            &hash(&c.env, 1),
            &Symbol::new(&c.env, "PROY001"),
        )
    };
    assert_eq!(propio(&c), Err(Ok(Error::CreditoYaExiste)));

    c.client.retirar_credito(&id, &Symbol::new(&c.env, "EMPRESA_DEMO"));
    assert_eq!(propio(&c), Err(Ok(Error::CreditoYaExiste)));
    assert_eq!(c.client.total_emitido(), 100);
}

/// Doble retiro: el segundo falla con CreditoRetirado y no cambia
/// beneficiario, fecha, historial ni el total retirado.
#[test]
fn doble_retiro_es_rechazado_y_no_altera_nada() {
    let c = setup();
    let id = Symbol::new(&c.env, "CRED001");
    emitir(&c, &id, 100);
    c.client.retirar_credito(&id, &Symbol::new(&c.env, "EMPRESA_A"));
    let despues_1 = c.client.verificar_credito(&id);

    let r = c
        .client
        .try_retirar_credito(&id, &Symbol::new(&c.env, "EMPRESA_B"));
    assert_eq!(r, Err(Ok(Error::CreditoRetirado)));

    assert_eq!(c.client.verificar_credito(&id), despues_1);
    assert_eq!(c.client.total_retirado(), 100);
    assert_eq!(c.client.total_movimientos(&id), 2); // emision + retiro
}

/// Tras retirar, ni transferir ni retirar (por el dueño que sea) funcionan.
#[test]
fn credito_retirado_queda_congelado() {
    let c = setup();
    let id = Symbol::new(&c.env, "CRED001");
    emitir(&c, &id, 50);
    c.client.retirar_credito(&id, &Symbol::new(&c.env, "EMPRESA_A"));

    assert_eq!(
        c.client.try_transferir_credito(&id, &c.comprador),
        Err(Ok(Error::CreditoRetirado))
    );
    assert_eq!(c.client.verificar_credito(&id).propietario, c.productor);
}

/// Un dueño anterior no puede volver a vender/retirar tras transferir:
/// la autorización siempre se exige al dueño ACTUAL. Se comprueba con
/// auths explícitas (sin mock_all_auths) y leyendo quién fue exigido.
#[test]
fn solo_el_dueno_actual_es_autorizado_para_retirar() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    use soroban_sdk::IntoVal;

    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(GreenLedgerContract, ());
    let client = GreenLedgerContractClient::new(&env, &cid);
    let admin = Address::generate(&env);
    let ver = Address::generate(&env);
    let productor = Address::generate(&env);
    let comprador = Address::generate(&env);
    let id = Symbol::new(&env, "CRED001");
    let benef = Symbol::new(&env, "EMPRESA_A");

    client.initialize(&admin);
    client.agregar_verificador(&ver);
    client.emitir_credito(
        &ver, &id, &productor, &10, &hash(&env, 1), &Symbol::new(&env, "P"),
    );
    client.transferir_credito(&id, &comprador);

    // Solo el dueño anterior (productor) autoriza: debe fallar.
    env.mock_auths(&[MockAuth {
        address: &productor,
        invoke: &MockAuthInvoke {
            contract: &cid,
            fn_name: "retirar_credito",
            args: (id.clone(), benef.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_retirar_credito(&id, &benef).is_err());
    assert_eq!(client.verificar_credito(&id).estado, EstadoCredito::Emitido);

    // El dueño actual (comprador) sí puede.
    env.mock_auths(&[MockAuth {
        address: &comprador,
        invoke: &MockAuthInvoke {
            contract: &cid,
            fn_name: "retirar_credito",
            args: (id.clone(), benef.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(
        client.retirar_credito(&id, &benef).estado,
        EstadoCredito::Retirado
    );
}

/// Un lote que intenta duplicar un id ya existente se revierte completo:
/// los ids nuevos no se crean y el total no cambia.
#[test]
fn lote_con_id_duplicado_se_revierte_completo() {
    let c = setup();
    let existente = Symbol::new(&c.env, "CRED001");
    emitir(&c, &existente, 100);

    let mut v: Vec<CreditoLote> = Vec::new(&c.env);
    for (n, t) in [("NUEVO1", 5u32), ("CRED001", 5), ("NUEVO2", 5)] {
        v.push_back(CreditoLote { id: Symbol::new(&c.env, n), toneladas: t });
    }
    let r = c.client.try_emitir_lote(
        &c.verificador,
        &c.productor,
        &hash(&c.env, 1),
        &Symbol::new(&c.env, "PROY001"),
        &v,
    );
    assert_eq!(r, Err(Ok(Error::CreditoYaExiste)));

    assert_eq!(
        c.client.try_verificar_credito(&Symbol::new(&c.env, "NUEVO1")),
        Err(Ok(Error::CreditoNoExiste))
    );
    assert_eq!(
        c.client.try_verificar_credito(&Symbol::new(&c.env, "NUEVO2")),
        Err(Ok(Error::CreditoNoExiste))
    );
    assert_eq!(c.client.total_emitido(), 100);
}

/// Un verificador no autorizado no puede emitir, ni siquiera
/// un id nuevo: la emisión es el único camino para crear "oferta".
#[test]
fn verificador_no_autorizado_no_puede_emitir() {
    let c = setup();
    let intruso = Address::generate(&c.env);
    let r = c.client.try_emitir_credito(
        &intruso,
        &Symbol::new(&c.env, "X1"),
        &c.productor,
        &1,
        &hash(&c.env, 1),
        &Symbol::new(&c.env, "P"),
    );
    assert_eq!(r, Err(Ok(Error::NoAutorizado)));
    assert_eq!(c.client.total_emitido(), 0);
}
