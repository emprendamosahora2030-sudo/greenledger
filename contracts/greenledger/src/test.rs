//! Pruebas del contrato GreenLedger v2.
//!
//! Convención: `setup()` deja un contrato inicializado con un admin y un
//! verificador ya autorizados, usando `mock_all_auths()` (cualquier
//! `require_auth()` se acepta sin importar la dirección). Las pruebas que
//! necesitan comprobar que *solo* una dirección concreta puede autorizar
//! una llamada usan `mock_auths` de forma puntual, apuntando a una
//! dirección distinta a la esperada, para demostrar que la operación
//! falla.
#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{Env, IntoVal};

fn crear_hash(env: &Env, semilla: u8) -> BytesN<32> {
    BytesN::from_array(env, &[semilla; 32])
}

struct Contexto {
    env: Env,
    client: GreenLedgerContractClient<'static>,
    admin: Address,
    verificador: Address,
}

/// Crea un contrato inicializado con un admin y un verificador
/// autorizado, listo para emitir créditos.
fn setup() -> Contexto {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GreenLedgerContract, ());
    let client = GreenLedgerContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let verificador = Address::generate(&env);

    client.initialize(&admin);
    client.agregar_verificador(&verificador);

    Contexto {
        env,
        client,
        admin,
        verificador,
    }
}

#[test]
fn admin_puede_agregar_y_quitar_verificador() {
    let ctx = setup();
    let otro_verificador = Address::generate(&ctx.env);

    ctx.client.agregar_verificador(&otro_verificador);

    let propietario = Address::generate(&ctx.env);
    let id = Symbol::new(&ctx.env, "CRED_A");
    let hash = crear_hash(&ctx.env, 1);
    let proyecto = Symbol::new(&ctx.env, "PROY01");

    // El nuevo verificador ya puede emitir.
    ctx.client
        .emitir_credito(&otro_verificador, &id, &propietario, &10, &hash, &proyecto);

    ctx.client.quitar_verificador(&otro_verificador);

    let id2 = Symbol::new(&ctx.env, "CRED_B");
    let resultado = ctx.client.try_emitir_credito(
        &otro_verificador,
        &id2,
        &propietario,
        &10,
        &hash,
        &proyecto,
    );
    assert_eq!(resultado, Err(Ok(Error::NoAutorizado)));
}

#[test]
#[should_panic]
fn solo_admin_agrega_verificador() {
    let env = Env::default();
    let contract_id = env.register(GreenLedgerContract, ());
    let client = GreenLedgerContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let intruso = Address::generate(&env);
    let candidato = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Solo se autoriza al intruso, nunca al admin real: la llamada debe
    // fallar porque el contrato exige la firma del admin guardado.
    env.mock_auths(&[MockAuth {
        address: &intruso,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "agregar_verificador",
            args: (candidato.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    client.agregar_verificador(&candidato);
}

#[test]
fn no_verificador_no_puede_emitir() {
    let ctx = setup();
    let no_verificador = Address::generate(&ctx.env);
    let propietario = Address::generate(&ctx.env);
    let hash = crear_hash(&ctx.env, 2);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    let id = Symbol::new(&ctx.env, "CRED001");

    let resultado = ctx.client.try_emitir_credito(
        &no_verificador,
        &id,
        &propietario,
        &100,
        &hash,
        &proyecto,
    );

    assert_eq!(resultado, Err(Ok(Error::NoAutorizado)));
}

#[test]
fn no_permite_toneladas_en_cero() {
    let ctx = setup();
    let propietario = Address::generate(&ctx.env);
    let hash = crear_hash(&ctx.env, 3);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    let id = Symbol::new(&ctx.env, "CRED001");

    let resultado = ctx.client.try_emitir_credito(
        &ctx.verificador,
        &id,
        &propietario,
        &0,
        &hash,
        &proyecto,
    );

    assert_eq!(resultado, Err(Ok(Error::ToneladasInvalidas)));
}

#[test]
fn no_permite_id_duplicado() {
    let ctx = setup();
    let propietario = Address::generate(&ctx.env);
    let hash = crear_hash(&ctx.env, 4);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    let id = Symbol::new(&ctx.env, "CRED001");

    ctx.client
        .emitir_credito(&ctx.verificador, &id, &propietario, &50, &hash, &proyecto);

    let resultado = ctx.client.try_emitir_credito(
        &ctx.verificador,
        &id,
        &propietario,
        &50,
        &hash,
        &proyecto,
    );

    assert_eq!(resultado, Err(Ok(Error::CreditoYaExiste)));
}

#[test]
fn transferir_credito_exitosa() {
    let ctx = setup();
    let propietario = Address::generate(&ctx.env);
    let nuevo_propietario = Address::generate(&ctx.env);
    let hash = crear_hash(&ctx.env, 5);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    let id = Symbol::new(&ctx.env, "CRED001");

    ctx.client
        .emitir_credito(&ctx.verificador, &id, &propietario, &75, &hash, &proyecto);

    let credito = ctx.client.transferir_credito(&id, &nuevo_propietario);

    assert_eq!(credito.propietario, nuevo_propietario);
    assert_eq!(credito.estado, EstadoCredito::Emitido);
}

#[test]
#[should_panic]
fn transferir_credito_falla_si_no_firma_el_propietario() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GreenLedgerContract, ());
    let client = GreenLedgerContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let verificador = Address::generate(&env);
    let propietario = Address::generate(&env);
    let atacante = Address::generate(&env);
    let hash = crear_hash(&env, 6);
    let proyecto = Symbol::new(&env, "PROY01");
    let id = Symbol::new(&env, "CRED001");

    client.initialize(&admin);
    client.agregar_verificador(&verificador);
    client.emitir_credito(&verificador, &id, &propietario, &20, &hash, &proyecto);

    // Solo se autoriza al atacante, no al propietario real: la llamada
    // debe fallar porque el contrato exige la firma del dueño actual.
    env.mock_auths(&[MockAuth {
        address: &atacante,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "transferir_credito",
            args: (id.clone(), atacante.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    client.transferir_credito(&id, &atacante);
}

#[test]
fn transferir_credito_falla_al_mismo_propietario() {
    let ctx = setup();
    let propietario = Address::generate(&ctx.env);
    let hash = crear_hash(&ctx.env, 7);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    let id = Symbol::new(&ctx.env, "CRED001");

    ctx.client
        .emitir_credito(&ctx.verificador, &id, &propietario, &30, &hash, &proyecto);

    let resultado = ctx.client.try_transferir_credito(&id, &propietario);
    assert_eq!(resultado, Err(Ok(Error::MismoPropietario)));
}

#[test]
fn retiro_exitoso_y_bloquea_operaciones_posteriores() {
    let ctx = setup();
    let propietario = Address::generate(&ctx.env);
    let otro_propietario = Address::generate(&ctx.env);
    let hash = crear_hash(&ctx.env, 8);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    let id = Symbol::new(&ctx.env, "CRED001");
    let beneficiario = Symbol::new(&ctx.env, "EMPRESA_DEMO");

    ctx.client
        .emitir_credito(&ctx.verificador, &id, &propietario, &40, &hash, &proyecto);

    let credito = ctx.client.retirar_credito(&id, &beneficiario);

    assert_eq!(credito.estado, EstadoCredito::Retirado);
    assert!(credito.retirado_en.is_some());
    assert_eq!(credito.beneficiario_retiro, Some(beneficiario.clone()));

    let falla_transferir = ctx.client.try_transferir_credito(&id, &otro_propietario);
    assert_eq!(falla_transferir, Err(Ok(Error::CreditoRetirado)));

    let falla_retirar = ctx.client.try_retirar_credito(&id, &beneficiario);
    assert_eq!(falla_retirar, Err(Ok(Error::CreditoRetirado)));
}

#[test]
fn verificar_certificado_compara_hash() {
    let ctx = setup();
    let propietario = Address::generate(&ctx.env);
    let hash_correcto = crear_hash(&ctx.env, 9);
    let hash_incorrecto = crear_hash(&ctx.env, 200);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    let id = Symbol::new(&ctx.env, "CRED001");

    ctx.client.emitir_credito(
        &ctx.verificador,
        &id,
        &propietario,
        &60,
        &hash_correcto,
        &proyecto,
    );

    assert!(ctx.client.verificar_certificado(&id, &hash_correcto));
    assert!(!ctx.client.verificar_certificado(&id, &hash_incorrecto));
}

#[test]
fn totales_emitido_y_retirado_correctos() {
    let ctx = setup();
    let propietario_a = Address::generate(&ctx.env);
    let propietario_b = Address::generate(&ctx.env);
    let hash = crear_hash(&ctx.env, 10);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    let id_a = Symbol::new(&ctx.env, "CRED_A");
    let id_b = Symbol::new(&ctx.env, "CRED_B");
    let beneficiario = Symbol::new(&ctx.env, "EMPRESA_DEMO");

    ctx.client.emitir_credito(
        &ctx.verificador,
        &id_a,
        &propietario_a,
        &100,
        &hash,
        &proyecto,
    );
    ctx.client.emitir_credito(
        &ctx.verificador,
        &id_b,
        &propietario_b,
        &50,
        &hash,
        &proyecto,
    );

    assert_eq!(ctx.client.total_emitido(), 150);
    assert_eq!(ctx.client.total_retirado(), 0);

    ctx.client.retirar_credito(&id_a, &beneficiario);

    assert_eq!(ctx.client.total_emitido(), 150);
    assert_eq!(ctx.client.total_retirado(), 100);
}

#[test]
fn no_se_puede_inicializar_dos_veces() {
    let ctx = setup();
    let resultado = ctx.client.try_initialize(&ctx.admin);
    assert_eq!(resultado, Err(Ok(Error::YaInicializado)));
}

#[test]
fn verificar_credito_inexistente_falla() {
    let ctx = setup();
    let id = Symbol::new(&ctx.env, "NO_EXISTE");
    let resultado = ctx.client.try_verificar_credito(&id);
    assert_eq!(resultado, Err(Ok(Error::CreditoNoExiste)));
}

// --- Historial de propiedad --------------------------------------------

/// Emite un crédito de prueba de 10 t a nombre de `propietario`.
fn emitir(ctx: &Contexto, id: &Symbol, propietario: &Address) {
    let hash = crear_hash(&ctx.env, 1);
    let proyecto = Symbol::new(&ctx.env, "PROY01");
    ctx.client
        .emitir_credito(&ctx.verificador, id, propietario, &10, &hash, &proyecto);
}

/// Mueve el ledger simulado, para que cada movimiento quede con un
/// número de ledger y un timestamp distintos.
fn avanzar_ledger(env: &Env, secuencia: u32, timestamp: u64) {
    env.ledger().with_mut(|l| {
        l.sequence_number = secuencia;
        l.timestamp = timestamp;
    });
}

#[test]
fn historial_registra_emision_transferencias_y_retiro() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    let c = Address::generate(&ctx.env);
    let id = Symbol::new(&ctx.env, "CRED001");
    let beneficiario = Symbol::new(&ctx.env, "EMPRESA_DEMO");

    avanzar_ledger(&ctx.env, 100, 1_000);
    emitir(&ctx, &id, &a);
    avanzar_ledger(&ctx.env, 200, 2_000);
    ctx.client.transferir_credito(&id, &b);
    avanzar_ledger(&ctx.env, 300, 3_000);
    ctx.client.transferir_credito(&id, &c);
    avanzar_ledger(&ctx.env, 400, 4_000);
    ctx.client.retirar_credito(&id, &beneficiario);

    assert_eq!(ctx.client.total_movimientos(&id), 4);
    let historial = ctx.client.historial_credito(&id, &0, &10);
    assert_eq!(historial.len(), 4);

    assert_eq!(
        historial.get_unchecked(0),
        Movimiento {
            tipo: TipoMovimiento::Emision,
            propietario_anterior: None,
            propietario: a.clone(),
            beneficiario_retiro: None,
            ledger: 100,
            timestamp: 1_000,
        }
    );
    assert_eq!(
        historial.get_unchecked(1),
        Movimiento {
            tipo: TipoMovimiento::Transferencia,
            propietario_anterior: Some(a.clone()),
            propietario: b.clone(),
            beneficiario_retiro: None,
            ledger: 200,
            timestamp: 2_000,
        }
    );
    assert_eq!(
        historial.get_unchecked(2),
        Movimiento {
            tipo: TipoMovimiento::Transferencia,
            propietario_anterior: Some(b.clone()),
            propietario: c.clone(),
            beneficiario_retiro: None,
            ledger: 300,
            timestamp: 3_000,
        }
    );
    assert_eq!(
        historial.get_unchecked(3),
        Movimiento {
            tipo: TipoMovimiento::Retiro,
            propietario_anterior: Some(c.clone()),
            propietario: c.clone(),
            beneficiario_retiro: Some(beneficiario),
            ledger: 400,
            timestamp: 4_000,
        }
    );
}

#[test]
fn historial_se_puede_paginar() {
    let ctx = setup();
    let id = Symbol::new(&ctx.env, "CRED001");
    let mut duenos = std::vec::Vec::new();
    for _ in 0..6 {
        duenos.push(Address::generate(&ctx.env));
    }

    // 1 emisión + 5 transferencias = 6 movimientos.
    emitir(&ctx, &id, &duenos[0]);
    for dueno in &duenos[1..] {
        ctx.client.transferir_credito(&id, dueno);
    }
    assert_eq!(ctx.client.total_movimientos(&id), 6);

    let pagina = ctx.client.historial_credito(&id, &2, &3);
    assert_eq!(pagina.len(), 3);
    for (i, movimiento) in pagina.iter().enumerate() {
        assert_eq!(movimiento.propietario, duenos[2 + i]);
    }

    // La última página puede venir incompleta.
    assert_eq!(ctx.client.historial_credito(&id, &4, &10).len(), 2);
    // Fuera de rango o con límite 0: lista vacía, no error.
    assert_eq!(ctx.client.historial_credito(&id, &6, &10).len(), 0);
    assert_eq!(ctx.client.historial_credito(&id, &u32::MAX, &u32::MAX).len(), 0);
    assert_eq!(ctx.client.historial_credito(&id, &0, &0).len(), 0);
}

#[test]
fn historial_recorta_el_limite_por_pagina() {
    let ctx = setup();
    let id = Symbol::new(&ctx.env, "CRED001");

    emitir(&ctx, &id, &Address::generate(&ctx.env));
    for _ in 0..MAX_MOVIMIENTOS_POR_PAGINA + 5 {
        ctx.client
            .transferir_credito(&id, &Address::generate(&ctx.env));
    }

    let pagina = ctx.client.historial_credito(&id, &0, &1_000);
    assert_eq!(pagina.len(), MAX_MOVIMIENTOS_POR_PAGINA);
}

#[test]
fn operaciones_fallidas_no_agregan_movimientos() {
    let ctx = setup();
    let propietario = Address::generate(&ctx.env);
    let id = Symbol::new(&ctx.env, "CRED001");
    let beneficiario = Symbol::new(&ctx.env, "EMPRESA_DEMO");

    emitir(&ctx, &id, &propietario);

    let falla = ctx.client.try_transferir_credito(&id, &propietario);
    assert_eq!(falla, Err(Ok(Error::MismoPropietario)));
    assert_eq!(ctx.client.total_movimientos(&id), 1);

    ctx.client.retirar_credito(&id, &beneficiario);
    let falla = ctx.client.try_retirar_credito(&id, &beneficiario);
    assert_eq!(falla, Err(Ok(Error::CreditoRetirado)));
    let falla = ctx
        .client
        .try_transferir_credito(&id, &Address::generate(&ctx.env));
    assert_eq!(falla, Err(Ok(Error::CreditoRetirado)));
    assert_eq!(ctx.client.total_movimientos(&id), 2);
}

#[test]
fn historiales_son_independientes_por_credito() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    let id1 = Symbol::new(&ctx.env, "CRED001");
    let id2 = Symbol::new(&ctx.env, "CRED002");

    emitir(&ctx, &id1, &a);
    emitir(&ctx, &id2, &a);
    ctx.client.transferir_credito(&id1, &b);

    assert_eq!(ctx.client.total_movimientos(&id1), 2);
    assert_eq!(ctx.client.total_movimientos(&id2), 1);
    let historial2 = ctx.client.historial_credito(&id2, &0, &10);
    assert_eq!(historial2.get_unchecked(0).propietario, a);
}

#[test]
fn historial_de_credito_inexistente_falla() {
    let ctx = setup();
    let id = Symbol::new(&ctx.env, "NOEXISTE");

    assert_eq!(
        ctx.client.try_total_movimientos(&id),
        Err(Ok(Error::CreditoNoExiste))
    );
    assert_eq!(
        ctx.client.try_historial_credito(&id, &0, &10),
        Err(Ok(Error::CreditoNoExiste))
    );
}
