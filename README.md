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
| v2      | [`CDYAQU4BG5WARTWX6CVILBDAWHU52YP4HHRRL2HICTC6725Y4ZNGGCQF`](https://stellar.expert/explorer/testnet/contract/CDYAQU4BG5WARTWX6CVILBDAWHU52YP4HHRRL2HICTC6725Y4ZNGGCQF) | **Vigente en testnet** — incluye historial de propiedad |
| v2 (sin historial) | [`CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y`](https://stellar.expert/explorer/testnet/contract/CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y) | Primera instancia v2, reemplazada; se conserva como referencia |

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
| `historial_credito(id, desde, limite)` | pública, sin firma | Historial de propiedad en orden cronológico (emisión, transferencias, retiro), paginado; máx. 50 por llamada. |
| `total_movimientos(id)` | pública, sin firma | Cuántos movimientos tiene el historial (para paginar). |
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
(`greenledger-comprador`), lo retira a nombre de `EMPRESA_DEMO` y, al
final, imprime su historial de propiedad.

### Despliegue v2 en testnet (verificado)

Ejecutado con `stellar-cli` 28.0.0 contra testnet (protocolo 28).
Contract ID: `CDYAQU4BG5WARTWX6CVILBDAWHU52YP4HHRRL2HICTC6725Y4ZNGGCQF`.
WASM hash: `c10426eac025b2fe373664d7a9f5d8bb1ec5b67dfdbdb30321e204032b89eeea`
(14.303 bytes optimizado).

| Paso | Transacción |
|---|---|
| Subida del WASM | [`769aa85f…`](https://stellar.expert/explorer/testnet/tx/769aa85fd653aba067a6e7bc6b6c57b4c3214eed8083da714ff39713ac83f323) |
| Despliegue del contrato | [`c93317ab…`](https://stellar.expert/explorer/testnet/tx/c93317abb2e6295781f398b1e10687e50f0cf2e3a91085309462ec4352b4d3b9) |
| `initialize` | [`277c1f34…`](https://stellar.expert/explorer/testnet/tx/277c1f347354860c3abeeb447f0e8fc271ec476bf2a30ab849e69193c979ea69) |
| `agregar_verificador` | [`ed5efc04…`](https://stellar.expert/explorer/testnet/tx/ed5efc0433550f32f750ac4d1efdd847fb153be4b51463c561e75cfd3277852c) |
| `emitir_credito` CRED001 (100 t) | [`63c4ecdc…`](https://stellar.expert/explorer/testnet/tx/63c4ecdc938868253cb50cc0c664dbcf17d7a2091373feb3e75ab201f0cb603b) |
| `transferir_credito` → comprador | [`d28b9dd8…`](https://stellar.expert/explorer/testnet/tx/d28b9dd8cac51a9bc485966056d9e10feb34f158d1fbe668c2d58ec2a1e831b5) |
| `retirar_credito` → `EMPRESA_DEMO` | [`e2b239d7…`](https://stellar.expert/explorer/testnet/tx/e2b239d7fd9209664635c15e8cb00b2df14324ca26e3bd68ad11540c66307ce9) |

`historial_credito(CRED001, 0, 50)` devuelve en cadena:

| # | Tipo | Anterior → Nuevo dueño | Ledger |
|---|---|---|---|
| 0 | `Emision` | — → admin (`GDUU…D7PZ`) | 4865317 |
| 1 | `Transferencia` | admin → comprador (`GC4H…LTWM`) | 4865318 |
| 2 | `Retiro` | comprador, a nombre de `EMPRESA_DEMO` | 4865319 |

Otras comprobaciones en cadena: `total_movimientos = 3`,
`verificar_certificado(CRED001, hash) = true`, un segundo
`retirar_credito(CRED001)` se rechaza con `Error(Contract, #5)` =
`CreditoRetirado` sin agregar movimientos al historial, y el historial
de un id inexistente devuelve `Error(Contract, #4)` = `CreditoNoExiste`.

Cuentas de prueba (solo testnet): admin/verificador
`GDUUFHKPZJDBLPEJJWMTFVGVGDXCHE3HLB7OPHJLQQ562IV6TE66D7PZ`, comprador
`GC4H6NDQHNTFQFCT3DLBSCORVMILYNSEI6Y7CUBYIG673B25L5AJLTWM`.

> Correr el script de nuevo despliega **otra** instancia con un Contract
> ID distinto; la de arriba es la instancia de referencia del v2.

## Pendientes antes de mainnet

Hoy el objetivo es un contrato sólido en **testnet** para el demo de
Blockchain Builders 101. Mainnet se evalúa cuando haya aliados
verificadores confirmados (Cercarbono, RIA, Masbosques). Antes de ese
paso hace falta:

- **Endurecer el rol de admin.** Hoy es una sola llave (`Address` fija en
  `initialize`) y no se puede cambiar. Antes de mainnet se necesita
  multifirma y/o una función para transferir el rol de admin, así una
  llave perdida o comprometida no deja bloqueada la gobernanza de los
  verificadores.
- Revisar los TTL (`CREDITO_TTL_*`, `INSTANCE_TTL_*`) según el uso real y
  agregar una función pública para renovar el TTL de un crédito y de
  todo su historial (ver `docs/ARQUITECTURA.md`, "Historial de
  propiedad").

## Seguridad

Nunca subas al repositorio llaves secretas (`S...`) ni frases de
recuperación. `stellar keys generate` guarda las identidades fuera del
repo; `.gitignore` excluye además cualquier archivo de identidades o
`.env` que pudiera crearse localmente.
