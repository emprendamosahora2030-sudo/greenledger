# GreenLedger

GreenLedger es un registro verificable de créditos de carbono construido
sobre **Stellar / Soroban**. Es un producto de **CIT Has It All S.A.S.**
(Medellín, Colombia).

Cada crédito emitido es un activo único (no fungible) con un ciclo de
vida controlado en cadena: **Emitido → Transferido (0 o más veces) →
Retirado (definitivo)**. El objetivo es impedir la **doble venta** y la
**doble contabilidad** de toneladas de carbono ya certificadas.

## Versiones del contrato

| Versión | Contract ID (testnet)                                       | Estado |
|---------|--------------------------------------------------------------|--------|
| v1      | `CCRM3PZEMJMZLIM5B6SRMNILPDACR4KEHFS6ODBGHDPVOFNPK7B2XSWT`   | En producción de pruebas (no se modifica) |
| v2      | _Pendiente — ver "Desplegar en testnet" más abajo_            | Código listo, despliegue por ejecutar |

> El v2 vive en `contracts/greenledger/` y **no reemplaza ni redespliega
> el v1**: son contratos independientes en testnet.

## Qué va en la red y qué no

GreenLedger está diseñado para no guardar datos personales en Stellar:

**Sí va en la red (`CreditoCarbono`):**
- Direcciones (`Address`) del propietario y del verificador.
- Toneladas de CO₂e certificadas.
- Estado del ciclo de vida (`Emitido` / `Retirado`).
- **Hash SHA-256** del certificado del verificador (no el PDF).
- Código del proyecto de origen (`Symbol`, p. ej. `PROY001`).
- Marca de tiempo de emisión y, si aplica, de retiro.
- Código o nombre corto del **beneficiario del retiro** (p. ej. una
  empresa compradora), nunca el de una persona natural.

**Nunca va en la red:**
- Nombres, documentos de identidad o teléfonos de personas.
- El PDF del certificado (solo su hash).
- Cualquier dato que permita identificar a una persona natural.

## Contrato v2 — funciones

Definidas en `contracts/greenledger/src/lib.rs`:

| Función | Quién firma | Descripción |
|---|---|---|
| `initialize(admin)` | — | Se ejecuta una sola vez; guarda el admin. Falla si ya está inicializado. |
| `agregar_verificador(verificador)` | admin | Autoriza a una dirección a emitir créditos. |
| `quitar_verificador(verificador)` | admin | Revoca esa autorización. |
| `emitir_credito(verificador, id, propietario, toneladas, hash_certificado, proyecto)` | verificador autorizado | Crea un crédito nuevo. Falla si el id ya existe o si `toneladas == 0`. |
| `verificar_credito(id)` | pública, sin firma | Devuelve el estado completo del crédito. |
| `transferir_credito(id, nuevo_propietario)` | propietario actual | Cambia el dueño. Falla si el crédito está retirado o si el nuevo dueño es el mismo. |
| `retirar_credito(id, beneficiario_retiro)` | propietario actual | Retira el crédito de forma **irreversible**. |
| `verificar_certificado(id, hash)` | pública, sin firma | Compara un hash con el guardado en el crédito. |
| `total_emitido()` / `total_retirado()` | pública, sin firma | Toneladas acumuladas históricas. |

Errores (`contracts/greenledger/src/lib.rs`, `enum Error`):
`YaInicializado`, `NoAutorizado`, `CreditoYaExiste`, `CreditoNoExiste`,
`CreditoRetirado`, `ToneladasInvalidas`, `MismoPropietario`.

Eventos publicados (para que un explorador o una IA sigan la
trazabilidad): topics `("emitido", id)`, `("transferido", id)` y
`("retirado", id)`, con los datos relevantes de cada operación.

## Compilar y testear

Requiere Rust estable + `stellar-cli` ([instrucciones oficiales](https://developers.stellar.org/docs/tools/developer-tools)).

```bash
cd contracts/greenledger

# Pruebas unitarias (no requieren red)
cargo test

# Compilación a WASM optimizado para despliegue
stellar contract build
```

## Desplegar en testnet

```bash
./scripts/deploy_testnet.sh
```

En Windows (PowerShell):

```powershell
./scripts/deploy_testnet.ps1
```

El script compila, crea/reutiliza la identidad `greenledger-admin`
(financiada con Friendbot), despliega el contrato, llama `initialize`,
registra al admin como verificador, emite el crédito de ejemplo
`CRED001` (100 t), lo transfiere a una segunda cuenta de prueba
(`greenledger-comprador`) y finalmente lo retira a nombre de
`EMPRESA_DEMO`.

> **Nota de esta entrega:** el entorno donde se generó este código tiene
> el acceso de red restringido por política (no llega a
> `horizon-testnet.stellar.org`, `friendbot.stellar.org` ni a
> `index.crates.io`), así que ni `cargo test` ni el despliegue se
> pudieron ejecutar aquí. El código y los scripts están listos para
> correr tal cual en un entorno con esos hosts habilitados; el Contract
> ID definitivo se debe completar en la tabla de arriba después de esa
> ejecución.

## Estructura del repositorio

```
contracts/greenledger/   Contrato v2 (Cargo.toml, src/lib.rs, src/test.rs)
scripts/                 Scripts de despliegue a testnet (.sh y .ps1)
docs/ARQUITECTURA.md     Ciclo de vida, roles, modelo de datos y decisiones de diseño
```

## Seguridad

Nunca subas al repositorio llaves secretas (`S...`) ni frases de
recuperación. `stellar keys generate` guarda las identidades fuera del
repo; `.gitignore` excluye además cualquier archivo de identidades o
`.env` que pudiera crearse localmente.
