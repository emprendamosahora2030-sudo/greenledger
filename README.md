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
| v2      | [`CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y`](https://stellar.expert/explorer/testnet/contract/CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y) | Desplegado en testnet (25-sep-2026) |

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

Requiere Rust estable, el target `wasm32v1-none`
(`rustup target add wasm32v1-none`) y `stellar-cli` v23 o superior
([instrucciones oficiales](https://developers.stellar.org/docs/tools/developer-tools)).
Si se compila `stellar-cli` desde crates.io en Linux, antes hay que
instalar `libdbus-1-dev`, `libudev-dev` y `pkg-config`.

`Cargo.lock` está versionado a propósito: fija `ed25519-dalek` 2.x, ya
que con la 3.x los testutils de `soroban-sdk` 22 no compilan.

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

### Despliegue v2 en testnet (verificado)

Ejecutado con `stellar-cli` 28.0.0 contra testnet (protocolo 28).
WASM hash: `b28739bcd0cddd09180ae866ebfdf82f653e3c88f73e2dea2cc6954f16dbef61`
(9.990 bytes optimizado).

| Paso | Transacción |
|---|---|
| Subida del WASM | [`9d6a9478…`](https://stellar.expert/explorer/testnet/tx/9d6a94780788b490f573a057393a060e0a6aa2a311b60f8d28db789957115008) |
| Despliegue del contrato | [`7e29c9e8…`](https://stellar.expert/explorer/testnet/tx/7e29c9e85ba69ab6692855224f7cbca9dc89dbecc5154bff89a015c5a24e9dd5) |
| `initialize` | [`84401d95…`](https://stellar.expert/explorer/testnet/tx/84401d956134bbbc2be30ae886ee39ff7fd757c84c9fe530866fad821f1d6a1c) |
| `agregar_verificador` | [`4e9eb101…`](https://stellar.expert/explorer/testnet/tx/4e9eb10111e056e39815c0ee4a83eb59122e999a0e243a5024e18349cd7d2ede) |
| `emitir_credito` CRED001 (100 t) | [`607943ba…`](https://stellar.expert/explorer/testnet/tx/607943ba1dc450f3f8a9400fd2b0a29d263f80c0c632529c9626cf3788209218) |
| `transferir_credito` → comprador | [`3e567a4b…`](https://stellar.expert/explorer/testnet/tx/3e567a4bc6734ed8852dc1146f7540815302148d92ae6d227d855ab0ead7d8e5) |
| `retirar_credito` → `EMPRESA_DEMO` | [`80c079b3…`](https://stellar.expert/explorer/testnet/tx/80c079b3e0e05c5e8043b1f6ad2324f21306e2df170840119049baeada22f775) |

Comprobaciones posteriores en cadena: `total_emitido = 100`,
`total_retirado = 100`, `verificar_certificado(CRED001, hash) = true`, y
un segundo `retirar_credito(CRED001)` es rechazado con
`Error(Contract, #5)` = `CreditoRetirado` (sin doble conteo).

Cuentas de prueba (solo testnet): admin/verificador
`GDUUFHKPZJDBLPEJJWMTFVGVGDXCHE3HLB7OPHJLQQ562IV6TE66D7PZ`, comprador
`GC4H6NDQHNTFQFCT3DLBSCORVMILYNSEI6Y7CUBYIG673B25L5AJLTWM`.

> Correr el script de nuevo despliega **otra** instancia con un Contract
> ID distinto; la de arriba es la instancia de referencia del v2.

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
