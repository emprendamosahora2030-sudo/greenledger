# GreenLedger

GreenLedger es un registro verificable de créditos de carbono construido
sobre **Stellar / Soroban**. Es un producto de **CIT Has It All S.A.S.**
(Medellín, Colombia).

> Estado (28 sep 2026): repositorio abierto públicamente. Contrato v2 vigente y probado en Stellar testnet; próximo hito es sumar despliegue automatizado (CI) y ampliar cobertura de tests antes de evaluar mainnet.

Cada crédito emitido es un activo único (no fungible) con un ciclo de
vida controlado en cadena: **Emitido → Transferido (0 o más veces) →
Retirado (definitivo)**. El objetivo es impedir la **doble venta** y la
**doble contabilidad** de toneladas de carbono ya certificadas.

## Ejecutar el frontend

**Requisitos:** un navegador moderno (Chrome, Brave o Firefox) y, solo para emitir, transferir o retirar, la extensión [Freighter](https://www.freighter.app/) configurada en **Testnet**. Para servirlo localmente: Python 3 o Node.js.

**Instalación:** no hay dependencias que instalar. El SDK de Stellar y la API de Freighter se cargan por CDN.

**Cómo correrlo:**

```bash
cd frontend
python3 -m http.server 8000   # o: npx serve .
```

Abrir <http://localhost:8000>. Para consultar un crédito de ejemplo, escribir `DEMO001` en la pestaña "Consultar". El ID del contrato, la URL del RPC y la passphrase están en las tres constantes al inicio del `<script>` de `frontend/index.html`.

**Estructura:**

```
greenledger/
├── contracts/greenledger/   contrato Soroban (Rust) y sus 34 pruebas
├── frontend/index.html      interfaz (consulta, verificación, emisión, transferencia, retiro, certificado)
├── docs/semana3/Documentacion.md
├── scripts/                 despliegue en testnet
└── README.md
```

## Versiones del contrato

| Versión | Contract ID (testnet)                                       | Estado |
|---------|--------------------------------------------------------------|--------|
| v1      | `CCRM3PZEMJMZLIM5B6SRMNILPDACR4KEHFS6ODBGHDPVOFNPK7B2XSWT`   | En producción de pruebas (no se modifica) |
| v2      | [`CANJ564LVB4WBAYJWXRQKHJII456RW6XBWWM2FQCSSC6HLG27JP2A5O2`](https://stellar.expert/explorer/testnet/contract/CANJ564LVB4WBAYJWXRQKHJII456RW6XBWWM2FQCSSC6HLG27JP2A5O2) | **Vigente en testnet** — historial de propiedad + emisión por lotes |
| v2 (sin lotes) | [`CDYAQU4BG5WARTWX6CVILBDAWHU52YP4HHRRL2HICTC6725Y4ZNGGCQF`](https://stellar.expert/explorer/testnet/contract/CDYAQU4BG5WARTWX6CVILBDAWHU52YP4HHRRL2HICTC6725Y4ZNGGCQF) | Reemplazada; se conserva como referencia |
| v2 (sin historial ni lotes) | [`CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y`](https://stellar.expert/explorer/testnet/contract/CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y) | Primera instancia v2, reemplazada; se conserva como referencia |

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
| `emitir_lote(verificador, propietario, hash_certificado, proyecto, creditos)` | verificador autorizado | Emite de 1 a 25 créditos (`creditos`: lista de `{id, toneladas}`) de una misma verificación. **Atómico:** si uno falla, no se emite ninguno. Devuelve las toneladas totales del lote. |
| `verificar_credito(id)` | pública, sin firma | Devuelve el estado completo del crédito. |
| `transferir_credito(id, nuevo_propietario)` | propietario actual | Cambia el dueño. Falla si el crédito está retirado o si el nuevo dueño es el mismo. |
| `retirar_credito(id, beneficiario_retiro)` | propietario actual | Retira el crédito de forma **irreversible**. |
| `verificar_certificado(id, hash)` | pública, sin firma | Compara un hash con el guardado en el crédito. |
| `historial_credito(id, desde, limite)` | pública, sin firma | Historial de propiedad en orden cronológico (emisión, transferencias, retiro), paginado; máx. 50 por llamada. |
| `total_movimientos(id)` | pública, sin firma | Cuántos movimientos tiene el historial (para paginar). |
| `total_emitido()` / `total_retirado()` | pública, sin firma | Toneladas acumuladas históricas. |

Errores (`contracts/greenledger/src/lib.rs`, `enum Error`):
`YaInicializado`, `NoAutorizado`, `CreditoYaExiste`, `CreditoNoExiste`,
`CreditoRetirado`, `ToneladasInvalidas`, `MismoPropietario`, `LoteVacio`,
`LoteDemasiadoGrande` (códigos 1 a 9 en ese orden).

Eventos publicados (para que un explorador o una IA sigan la
trazabilidad): topics `("emitido", id)`, `("transferido", id)`,
`("retirado", id)` y `("lote_emitido", proyecto)`, con los datos
relevantes de cada operación. Un lote publica además un `emitido` por
cada crédito.

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

> Para presentar el contrato en vivo (paso a paso, con la salida esperada
> de cada comando) usa el guion [`DEMO.md`](DEMO.md).

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
final, imprime su historial de propiedad y emite el lote de ejemplo
`LOTE001..LOTE003` (proyecto `PROY002`, 60 t).

### Despliegue v2 en testnet (verificado)

Ejecutado con `stellar-cli` 28.0.0 contra testnet (protocolo 28).
Contract ID: `CANJ564LVB4WBAYJWXRQKHJII456RW6XBWWM2FQCSSC6HLG27JP2A5O2`.
WASM hash: `d273c0d5e04827dda898160a3729c62621bddf26abfb0bcd24ca66806fd40d79`
(16.033 bytes optimizado).

| Paso | Transacción |
|---|---|
| Subida del WASM | [`2f9f22ff…`](https://stellar.expert/explorer/testnet/tx/2f9f22ff7a357dcc8d0958d7d2a0e7ee866b12a0559f496ef3040002e72d541a) |
| Despliegue del contrato | [`bc602f79…`](https://stellar.expert/explorer/testnet/tx/bc602f796a371146d2cd8e269d41dedf5bf69cc97026729d2ba3124caeae4055) |
| `initialize` | [`5a3ed362…`](https://stellar.expert/explorer/testnet/tx/5a3ed3626fe17d6aa8420baa288eeaea792a4d76615f94570dfc6c508b805cc5) |
| `agregar_verificador` | [`fcedeff2…`](https://stellar.expert/explorer/testnet/tx/fcedeff2dcfda0e6e08d68f1e92c47c4fe26ad98c44eba39c0f31f046c1eba6e) |
| `emitir_credito` CRED001 (100 t) | [`f44c5d29…`](https://stellar.expert/explorer/testnet/tx/f44c5d29996505cee9617830556c071a79c426355a8dc570e42370739df10085) |
| `transferir_credito` → comprador | [`46b39008…`](https://stellar.expert/explorer/testnet/tx/46b390088672549155d0dd8fb0348031824bdcdb9b9fc6b73838c1a299538e53) |
| `retirar_credito` → `EMPRESA_DEMO` | [`2b0c25f2…`](https://stellar.expert/explorer/testnet/tx/2b0c25f20d583f0cdf78d786ff69723ac95cb42ab311e18276a05fe233d7d6cb) |
| `emitir_lote` LOTE001..LOTE003 (60 t) | [`d51fdd99…`](https://stellar.expert/explorer/testnet/tx/d51fdd99948bd7b25fae5db6a0ddf2eea0ec106d983300848e50a47e46c7be74) |
| `emitir_lote` de 25 créditos CARGA00..CARGA24 (325 t) | [`3bdc3696…`](https://stellar.expert/explorer/testnet/tx/3bdc3696780c5e635ce1bc7362b5e505dba9d5baa6ff87b4a2a86b231cd2ecc8) |

`historial_credito(CRED001, 0, 50)` devuelve en cadena Emision → Transferencia
(admin `GDUU…D7PZ` → comprador `GC4H…LTWM`) → Retiro a nombre de
`EMPRESA_DEMO`, con `total_movimientos = 3`.

Comprobaciones de rechazo en cadena:

| Caso | Resultado |
|---|---|
| Segundo `retirar_credito(CRED001)` | `#5 CreditoRetirado`; no agrega movimientos |
| Historial de un id inexistente | `#4 CreditoNoExiste` |
| `emitir_lote` con 26 créditos | `#9 LoteDemasiadoGrande` |
| `emitir_lote` con `LOTE002` (ya existe) en medio de dos ids nuevos | `#3 CreditoYaExiste`; los ids nuevos no se crean |
| `emitir_lote` firmado por una cuenta que no es verificador | `#2 NoAutorizado` |

`total_emitido = 485` (100 + 60 + 325). Los rechazos se comprobaron con
la simulación de testnet, que ejecuta el mismo código del host que la
red: la transacción ni siquiera se envía.

**Recursos de un lote de 25** (el máximo) frente a los límites por
transacción de testnet: 14,8 M de 400 M instrucciones (3,7 %), 76 de 200
entradas escritas (38 %) y 25 KB de 132 KB escritos (19 %). La comisión
fue de ~22,5 XLM, casi todo **renta de storage prepagada**: cada crédito
crea 3 entradas persistentes con TTL de ~1 año (≈0,9 XLM por crédito, ya
sea emitido solo o en lote). En testnet es gratis (Friendbot); para
mainnet ver "Pendientes".

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
DEMO.md                  Guion de demo en vivo con comandos y salidas esperadas
demo/                    Certificado ficticio y lote de ejemplo usados por DEMO.md
```

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
- Revisar los TTL (`CREDITO_TTL_*`, `INSTANCE_TTL_*`) según el uso real:
  con ~1 año de TTL la renta prepagada es ≈0,9 XLM por crédito. Además,
  agregar una función pública para renovar el TTL de un crédito y de
  todo su historial (ver `docs/ARQUITECTURA.md`, "Historial de
  propiedad").

## Seguridad

Nunca subas al repositorio llaves secretas (`S...`) ni frases de
recuperación. `stellar keys generate` guarda las identidades fuera del
repo; `.gitignore` excluye además cualquier archivo de identidades o
`.env` que pudiera crearse localmente.
## Testnet (admin en dos pasos)
Contract ID: CBZOZEFKCZDTP4JR23LEA3IRT2QMARPET3ZR74IKEBGYKXTCNVC46YPH

## Testnet (admin multifirma 2-de-3)
Contract ID: CCJWT5XBUIU6IPOCC6GDQC5LLC5XRGGB7NUC2AOCVZWZE3HGB5FKPX3T