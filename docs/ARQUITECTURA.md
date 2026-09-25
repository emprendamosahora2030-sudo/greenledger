# Arquitectura — GreenLedger v2

## Propósito

GreenLedger v2 modela cada crédito de carbono como un **activo único no
fungible** (NFT-like) dentro de un contrato Soroban propio, en lugar de
un simple contador como en v1. El contrato existe para que **nadie pueda
vender dos veces el mismo crédito** ni **contarlo dos veces** en la
contabilidad de dos partes distintas: el estado en cadena es la fuente
de verdad única sobre quién es dueño de cada tonelada certificada y si
ya fue retirada del mercado.

## Ciclo de vida de un crédito

```
        emitir_credito                 transferir_credito (0..n veces)
              │                                  │
              ▼                                  ▼
        ┌───────────┐   transferir_credito   ┌───────────┐
        │  Emitido  │ ─────────────────────▶ │  Emitido  │  (mismo estado,
        └───────────┘                        └───────────┘   nuevo dueño)
              │                                     │
              │             retirar_credito         │
              └────────────────┬────────────────────┘
                                ▼
                         ┌────────────┐
                         │  Retirado  │  (estado final, irreversible)
                         └────────────┘
```

- **Emitido**: estado inicial. Solo un verificador autorizado puede
  llegar aquí, vía `emitir_credito`.
- **Transferido**: no es un estado propio, sino cualquier número de
  cambios de propietario mientras el crédito sigue `Emitido`. Cada
  transferencia exige la firma del dueño actual.
- **Retirado**: estado final. Ocurre cuando el dueño actual decide
  "usar" el crédito (compensar sus emisiones) mediante
  `retirar_credito`, indicando a nombre de quién se retira. A partir de
  ahí, `transferir_credito` y `retirar_credito` fallan siempre con
  `CreditoRetirado`: no hay vuelta atrás. Esto es intencional — un
  crédito retirado ya fue "consumido" y no puede volver a circular ni
  volver a retirarse (lo que sería doble conteo).

## Roles

| Rol | Quién lo tiene | Puede |
|---|---|---|
| **Admin** | Una única `Address`, fijada en `initialize` | Agregar/quitar verificadores |
| **Verificador** | 0..n direcciones autorizadas por el admin | Emitir créditos nuevos |
| **Propietario** | La `Address` dueña de cada crédito en un momento dado | Transferir o retirar ese crédito |

El admin **no** puede emitir créditos directamente ni tocar los créditos
de otros: solo administra qué direcciones son verificadores. Esto separa
la gobernanza (quién puede certificar) de la operación (quién certifica
y quién posee), y evita que una sola llave tenga control total sobre los
activos de terceros.

La autorización se hace siempre releyendo la dirección relevante desde
el almacenamiento (`admin`, `credito.propietario`) y llamando
`require_auth()` sobre **esa** dirección — nunca sobre un parámetro que
el llamante podría falsificar. Así, "solo el admin" y "solo el dueño
actual" son garantías del propio contrato, no una convención que la
aplicación cliente deba respetar.

## Modelo de datos

```rust
enum EstadoCredito { Emitido, Retirado }

struct CreditoCarbono {
    id: Symbol,
    propietario: Address,
    toneladas: u32,
    estado: EstadoCredito,
    verificador: Address,
    hash_certificado: BytesN<32>,   // SHA-256 del PDF, no el PDF
    proyecto: Symbol,               // código del proyecto de origen
    emitido_en: u64,
    retirado_en: Option<u64>,
    beneficiario_retiro: Option<Symbol>,
}
```

Claves de almacenamiento (`DataKey`):

- `Admin` — instance storage. Una sola dirección.
- `Verificador(Address)` — instance storage. Un booleano por dirección
  autorizada (existe = autorizado).
- `Credito(Symbol)` — **persistent storage**. Un `CreditoCarbono` por
  id. Es la entidad central del contrato: cada id es un activo
  independiente con su propio historial de dueños.
- `NumMovimientos(Symbol)` — persistent storage. Cuántas entradas tiene
  el historial de propiedad de cada crédito.
- `Movimiento(Symbol, u32)` — persistent storage. La entrada `n` (desde
  0) del historial de propiedad de un crédito.
- `TotalEmitido` / `TotalRetirado` — instance storage. Contadores
  acumulados en toneladas (`u64`), para reportes rápidos sin tener que
  recorrer todos los créditos.

## Historial de propiedad

El diferenciador de GreenLedger es la **trazabilidad pública e
inmutable**: para cualquier crédito cualquiera puede consultar, sin
firmar nada, la cadena completa de dueños desde la emisión hasta el
retiro. Por eso el historial vive en el estado del contrato y no se
reconstruye desde eventos, que dependen de que un indexador los haya
guardado.

```rust
enum TipoMovimiento { Emision, Transferencia, Retiro }

struct Movimiento {
    tipo: TipoMovimiento,
    propietario_anterior: Option<Address>, // None en la emisión
    propietario: Address,                  // dueño tras el movimiento
    beneficiario_retiro: Option<Symbol>,   // solo en retiros
    ledger: u32,                           // para ubicarlo en un explorador
    timestamp: u64,
}
```

- **Append-only.** `emitir_credito`, `transferir_credito` y
  `retirar_credito` agregan una entrada; ninguna función modifica ni
  borra entradas anteriores. Toda operación fallida (p. ej. transferir
  un crédito retirado) devuelve error y Soroban revierte la transacción
  completa, así que nunca queda un movimiento a medias.
- **Invariante.** La entrada 0 siempre es `Emision`, el
  `propietario_anterior` de cada entrada `n > 0` es el `propietario` de
  la entrada `n - 1`, y, si existe, `Retiro` es la última.
- **Una clave por movimiento.** Cada entrada vive en su propia clave
  `Movimiento(id, n)` en lugar de un único `Vec` creciente. Así el
  historial no choca con el tamaño máximo de una entrada de ledger y
  escribir un movimiento nuevo cuesta lo mismo sin importar cuántos haya
  antes.
- **Lectura paginada.** `historial_credito(id, desde, limite)` devuelve
  como máximo `MAX_MOVIMIENTOS_POR_PAGINA` (50) entradas por llamada,
  para mantenerse dentro de los límites de lectura de una invocación;
  `total_movimientos(id)` da el total para paginar.
- **TTL.** Cada entrada recibe la misma extensión que el crédito al
  escribirse. Una entrada que no vuelve a escribirse (p. ej. el historial
  de un crédito retirado) puede archivarse cuando vence su TTL. En
  Soroban una entrada persistente archivada **no se borra**: se puede
  restaurar (`stellar contract restore`), pero hasta entonces su lectura
  falla. Queda pendiente antes de mainnet una función pública para
  renovar el TTL de un crédito y de todo su historial.

## Emisión por lotes

`emitir_lote` existe porque una verificación certificada normalmente
respalda muchas toneladas que se venden por separado. Reglas:

- **Una emisión = una verificación.** Todo el lote comparte
  verificador, propietario inicial, `proyecto` y `hash_certificado`;
  cada crédito solo varía en `id` y `toneladas` (`CreditoLote`). Para
  mezclar certificados distintos se usan lotes separados.
- **Atómico, todo o nada.** Cada crédito pasa por la misma validación
  que `emitir_credito` (toneladas > 0, id no existente, incluido un id
  repetido dentro del mismo lote). Al primer error la función devuelve
  `Err` y Soroban revierte la transacción completa: no queda ningún
  crédito, movimiento ni cambio en `TotalEmitido`.
- **Tamaño: de 1 a 25** (`MAX_CREDITOS_POR_LOTE`). Un lote vacío falla
  con `LoteVacio` y uno de 26 o más con `LoteDemasiadoGrande`, antes de
  escribir nada. 25 se midió en testnet y usa el 38 % del límite de
  escrituras por transacción (el recurso más ajustado); el tope deja
  margen si la red cambia sus límites.
- **Mismo resultado que emitir uno por uno.** Cada crédito queda igual
  que si se hubiera emitido con `emitir_credito`: su propio registro, su
  historial con la entrada `Emision` y su evento `emitido`. El lote suma
  un evento `lote_emitido` con verificador, propietario, cantidad de
  créditos y toneladas totales.

La lógica compartida vive en `crear_credito` (validación, escritura,
historial y evento), y `emitir_credito` / `emitir_lote` solo agregan la
firma, el rol de verificador y el contador global.

### Por qué persistent storage para los créditos

Los créditos son el registro que debe sobrevivir mientras exista el
activo que representan (potencialmente años). El contrato extiende el
TTL de cada entrada cada vez que la escribe (`extend_ttl` en
`emitir_credito`, `transferir_credito` y `retirar_credito`), de forma
que un crédito activo nunca expira por inactividad. El admin y la lista
de verificadores, al ser datos pequeños y de uso frecuente, viven en
instance storage (que comparte TTL con el propio contrato) y también se
renuevan en cada operación administrativa.

### Por qué no se guarda el PDF del certificado

Un PDF puede pesar cientos de KB y, sobre todo, puede contener datos
personales (nombre del titular, ubicación exacta, firmas). Subirlo a una
red pública sería irreversible y innecesario. En cambio, el contrato
guarda su **hash SHA-256** (`hash_certificado: BytesN<32>`): cualquiera
que tenga el PDF real puede recalcular su hash localmente y compararlo
con `verificar_certificado(id, hash)` para confirmar que es el documento
original, sin que el documento en sí toque la cadena.

## Decisiones de diseño distintas al enunciado original (y por qué)

1. **Las funciones que pueden fallar devuelven `Result<T, Error>` en
   vez de valores planos.** El enunciado no especifica tipo de retorno
   para `transferir_credito`, `retirar_credito` ni `verificar_credito`
   más allá del nombre, y `verificar_certificado` se describe como
   `-> bool`. Se optó por `Result<T, Error>` de forma consistente en
   todas las funciones que pueden fallar (incluida
   `verificar_certificado -> Result<bool, Error>`), siguiendo el patrón
   idiomático de Soroban: el `#[contracterror] enum Error` ya definido
   se vuelve utilizable end-to-end (wallets, exploradores e
   integraciones ven el error exacto — p. ej. `CreditoNoExiste` — en
   vez de un panic genérico). `total_emitido`/`total_retirado`, que no
   pueden fallar, sí devuelven `u64` plano como pide el enunciado.
2. **`agregar_verificador`/`quitar_verificador` no reciben la dirección
   del admin como parámetro.** El contrato lee el admin desde su propio
   almacenamiento y exige su firma (`admin.require_auth()`), en vez de
   confiar en un parámetro que el llamante podría manipular. Es más
   seguro y no contradice la firma pedida en el enunciado (que tampoco
   incluía ese parámetro).
3. **Sin error `NoInicializado` dedicado.** El enunciado no lo pide.
   Si se llama a una función de rol antes de `initialize`, el contrato
   reutiliza `NoAutorizado` (no hay admin válido que pueda autorizar
   nada todavía), evitando ampliar la lista de errores más allá de la
   pedida.
4. **TTLs concretos.** El enunciado pide "extender el TTL al escribir"
   sin dar números. Se usó un umbral de ~30 días y una extensión de ~1
   año (asumiendo ~5s por ledger), documentados como constantes en
   `lib.rs` (`CREDITO_TTL_UMBRAL`, `CREDITO_TTL_EXTENSION`), fáciles de
   ajustar según el uso real en producción.
