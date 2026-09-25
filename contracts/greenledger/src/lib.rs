//! GreenLedger v2 — Registro de créditos de carbono no fungibles.
//!
//! Cada crédito es un activo único con ciclo de vida:
//! Emitido -> Transferido (0..n veces) -> Retirado (final, irreversible).
//! El objetivo es impedir la doble venta y la doble contabilidad de
//! toneladas de carbono ya certificadas.
//!
//! Importante: en la red solo viven datos técnicos del crédito (hash del
//! certificado, toneladas, direcciones, códigos). Nunca se guardan datos
//! personales (nombres, teléfonos, documentos de identidad, etc.).
#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, Symbol};

/// Cuántos ledgers equivalen aproximadamente a un día, asumiendo ~5s por
/// ledger (valor típico en testnet/mainnet de Stellar). Se usa solo para
/// calcular umbrales de extensión de TTL legibles por humanos.
const DIA_EN_LEDGERS: u32 = 17_280;

/// Umbral y extensión de TTL para cada crédito individual (persistent
/// storage): si al ciclo de vida le quedan menos de ~30 días, se extiende
/// hasta ~1 año más, para que el crédito nunca "expire" mientras exista.
const CREDITO_TTL_UMBRAL: u32 = DIA_EN_LEDGERS * 30;
const CREDITO_TTL_EXTENSION: u32 = DIA_EN_LEDGERS * 365;

/// Mismo criterio para el "instance storage" del contrato (admin,
/// verificadores autorizados y contadores globales).
const INSTANCE_TTL_UMBRAL: u32 = DIA_EN_LEDGERS * 30;
const INSTANCE_TTL_EXTENSION: u32 = DIA_EN_LEDGERS * 365;

/// Estado del ciclo de vida de un crédito de carbono.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EstadoCredito {
    Emitido,
    Retirado,
}

/// Datos on-chain de un crédito de carbono. Es un activo único (no
/// fungible): cada `id` representa exactamente una tonelada certificada
/// de un proyecto, con su propio historial de propietarios.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreditoCarbono {
    pub id: Symbol,
    pub propietario: Address,
    pub toneladas: u32,
    pub estado: EstadoCredito,
    pub verificador: Address,
    /// SHA-256 del certificado PDF emitido por el verificador. El PDF en
    /// sí nunca se sube a la red; solo su huella digital.
    pub hash_certificado: BytesN<32>,
    /// Código del proyecto de origen (p. ej. un código de registro
    /// internacional), no el nombre de personas involucradas.
    pub proyecto: Symbol,
    pub emitido_en: u64,
    pub retirado_en: Option<u64>,
    /// A nombre de quién se retira el crédito (p. ej. código o nombre de
    /// la empresa compradora). Nunca el nombre de una persona natural.
    pub beneficiario_retiro: Option<Symbol>,
}

/// Claves de almacenamiento del contrato.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Address del administrador (instance storage).
    Admin,
    /// Marca a una Address como verificador autorizado (instance storage).
    Verificador(Address),
    /// Un crédito individual, indexado por su id (persistent storage).
    Credito(Symbol),
    /// Toneladas totales emitidas históricamente (instance storage).
    TotalEmitido,
    /// Toneladas totales retiradas históricamente (instance storage).
    TotalRetirado,
}

/// Errores del contrato, expuestos con nombres en español para que
/// wallets, exploradores e integraciones puedan mostrarlos tal cual.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    YaInicializado = 1,
    NoAutorizado = 2,
    CreditoYaExiste = 3,
    CreditoNoExiste = 4,
    CreditoRetirado = 5,
    ToneladasInvalidas = 6,
    MismoPropietario = 7,
}

#[contract]
pub struct GreenLedgerContract;

#[contractimpl]
impl GreenLedgerContract {
    /// Inicializa el contrato guardando el admin. Solo puede llamarse una
    /// vez: una segunda llamada falla con `YaInicializado`.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::YaInicializado);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_UMBRAL, INSTANCE_TTL_EXTENSION);

        Ok(())
    }

    /// Autoriza a `verificador` a emitir créditos. Solo el admin puede
    /// hacerlo: el contrato exige la firma del admin guardado, sin
    /// importar quién envíe la transacción.
    pub fn agregar_verificador(env: Env, verificador: Address) -> Result<(), Error> {
        let admin = Self::obtener_admin(&env)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::Verificador(verificador), &true);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_UMBRAL, INSTANCE_TTL_EXTENSION);

        Ok(())
    }

    /// Revoca la autorización de `verificador`. Solo el admin puede
    /// hacerlo.
    pub fn quitar_verificador(env: Env, verificador: Address) -> Result<(), Error> {
        let admin = Self::obtener_admin(&env)?;
        admin.require_auth();

        env.storage()
            .instance()
            .remove(&DataKey::Verificador(verificador));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_UMBRAL, INSTANCE_TTL_EXTENSION);

        Ok(())
    }

    /// Emite un nuevo crédito de carbono. Solo un verificador autorizado
    /// puede hacerlo, y debe firmar la transacción él mismo.
    pub fn emitir_credito(
        env: Env,
        verificador: Address,
        id: Symbol,
        propietario: Address,
        toneladas: u32,
        hash_certificado: BytesN<32>,
        proyecto: Symbol,
    ) -> Result<CreditoCarbono, Error> {
        verificador.require_auth();

        if !Self::es_verificador(&env, &verificador) {
            return Err(Error::NoAutorizado);
        }
        if toneladas == 0 {
            return Err(Error::ToneladasInvalidas);
        }

        let clave = DataKey::Credito(id.clone());
        if env.storage().persistent().has(&clave) {
            return Err(Error::CreditoYaExiste);
        }

        let credito = CreditoCarbono {
            id: id.clone(),
            propietario: propietario.clone(),
            toneladas,
            estado: EstadoCredito::Emitido,
            verificador: verificador.clone(),
            hash_certificado,
            proyecto: proyecto.clone(),
            emitido_en: env.ledger().timestamp(),
            retirado_en: None,
            beneficiario_retiro: None,
        };

        env.storage().persistent().set(&clave, &credito);
        env.storage()
            .persistent()
            .extend_ttl(&clave, CREDITO_TTL_UMBRAL, CREDITO_TTL_EXTENSION);

        let total_previo = Self::total_emitido(env.clone());
        env.storage()
            .instance()
            .set(&DataKey::TotalEmitido, &(total_previo + toneladas as u64));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_UMBRAL, INSTANCE_TTL_EXTENSION);

        env.events().publish(
            (Symbol::new(&env, "emitido"), id),
            (propietario, toneladas, proyecto),
        );

        Ok(credito)
    }

    /// Lectura pública del estado completo de un crédito. No requiere
    /// autenticación: cualquiera puede verificar la trazabilidad.
    pub fn verificar_credito(env: Env, id: Symbol) -> Result<CreditoCarbono, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Credito(id))
            .ok_or(Error::CreditoNoExiste)
    }

    /// Transfiere el crédito a un nuevo propietario. Debe firmar el
    /// propietario actual. Falla si el crédito ya fue retirado o si el
    /// "nuevo" propietario es el mismo que ya lo tiene.
    pub fn transferir_credito(
        env: Env,
        id: Symbol,
        nuevo_propietario: Address,
    ) -> Result<CreditoCarbono, Error> {
        let clave = DataKey::Credito(id.clone());
        let mut credito: CreditoCarbono = env
            .storage()
            .persistent()
            .get(&clave)
            .ok_or(Error::CreditoNoExiste)?;

        if credito.estado == EstadoCredito::Retirado {
            return Err(Error::CreditoRetirado);
        }

        credito.propietario.require_auth();

        if nuevo_propietario == credito.propietario {
            return Err(Error::MismoPropietario);
        }

        let propietario_anterior = credito.propietario.clone();
        credito.propietario = nuevo_propietario.clone();

        env.storage().persistent().set(&clave, &credito);
        env.storage()
            .persistent()
            .extend_ttl(&clave, CREDITO_TTL_UMBRAL, CREDITO_TTL_EXTENSION);

        env.events().publish(
            (Symbol::new(&env, "transferido"), id),
            (propietario_anterior, nuevo_propietario),
        );

        Ok(credito)
    }

    /// Retira el crédito de forma definitiva a nombre de
    /// `beneficiario_retiro`. Debe firmar el propietario actual. Es
    /// irreversible: después ni transferir_credito ni retirar_credito
    /// vuelven a funcionar sobre este id.
    pub fn retirar_credito(
        env: Env,
        id: Symbol,
        beneficiario_retiro: Symbol,
    ) -> Result<CreditoCarbono, Error> {
        let clave = DataKey::Credito(id.clone());
        let mut credito: CreditoCarbono = env
            .storage()
            .persistent()
            .get(&clave)
            .ok_or(Error::CreditoNoExiste)?;

        if credito.estado == EstadoCredito::Retirado {
            return Err(Error::CreditoRetirado);
        }

        credito.propietario.require_auth();

        credito.estado = EstadoCredito::Retirado;
        credito.retirado_en = Some(env.ledger().timestamp());
        credito.beneficiario_retiro = Some(beneficiario_retiro.clone());

        env.storage().persistent().set(&clave, &credito);
        env.storage()
            .persistent()
            .extend_ttl(&clave, CREDITO_TTL_UMBRAL, CREDITO_TTL_EXTENSION);

        let total_previo = Self::total_retirado(env.clone());
        env.storage().instance().set(
            &DataKey::TotalRetirado,
            &(total_previo + credito.toneladas as u64),
        );
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_UMBRAL, INSTANCE_TTL_EXTENSION);

        env.events().publish(
            (Symbol::new(&env, "retirado"), id),
            (credito.propietario.clone(), beneficiario_retiro, credito.toneladas),
        );

        Ok(credito)
    }

    /// Compara el hash recibido con el hash del certificado guardado en
    /// el crédito. Permite validar un PDF sin nunca subirlo a la red.
    pub fn verificar_certificado(env: Env, id: Symbol, hash: BytesN<32>) -> Result<bool, Error> {
        let credito: CreditoCarbono = env
            .storage()
            .persistent()
            .get(&DataKey::Credito(id))
            .ok_or(Error::CreditoNoExiste)?;

        Ok(credito.hash_certificado == hash)
    }

    /// Toneladas totales emitidas históricamente (acumulado, nunca baja).
    pub fn total_emitido(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::TotalEmitido)
            .unwrap_or(0)
    }

    /// Toneladas totales retiradas históricamente (acumulado, nunca baja).
    pub fn total_retirado(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::TotalRetirado)
            .unwrap_or(0)
    }

    /// Lee el admin guardado. Si el contrato no fue inicializado todavía
    /// se reporta como `NoAutorizado`, ya que ninguna operación de rol
    /// puede autorizarse sin un admin definido.
    fn obtener_admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NoAutorizado)
    }

    /// Indica si `direccion` está autorizada como verificador.
    fn es_verificador(env: &Env, direccion: &Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Verificador(direccion.clone()))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
