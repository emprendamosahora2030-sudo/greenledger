# Guion de demo — GreenLedger v2 en testnet

Demo en vivo para **Blockchain Builders 101** (~10 minutos). Recorre el
ciclo de vida completo de un crédito de carbono en Stellar testnet y
termina con el intento de **doble retiro**, que el contrato rechaza.

```
desplegar → initialize → agregar verificador → emitir 1 crédito → emitir lote
  → transferir → retirar → consultar historial → doble retiro (falla ✅)
```

Todo el guion se ensayó de punta a punta en testnet el 25-sep-2026 (ver
[Ensayo](#ensayo-verificado)). Las salidas que aparecen abajo son las
reales de ese ensayo, recortadas.

---

## Preparación (antes de la presentación, una sola vez)

1. Instala `stellar-cli` v23 o superior (el ensayo usó la **28.0.0**) y
   verifica con `stellar --version`.
2. Abre una terminal en la **raíz del repositorio**: los comandos usan
   rutas relativas `demo/...`.
3. Crea y financia las 4 cuentas de prueba. Friendbot les da XLM de
   testnet gratis. Si una identidad ya existe, ese comando falla y se
   puede ignorar.

```
stellar keys generate greenledger-admin --network testnet --fund
stellar keys generate greenledger-verificador --network testnet --fund
stellar keys generate greenledger-productor --network testnet --fund
stellar keys generate greenledger-comprador --network testnet --fund
```

4. Comprueba que están las 4: `stellar keys ls`.

| Identidad | Rol en la historia |
|---|---|
| `greenledger-admin` | Administra el contrato: decide quién puede certificar. **No** puede emitir ni tocar créditos ajenos. |
| `greenledger-verificador` | Entidad verificadora (tipo Cercarbono): emite créditos respaldados por un certificado. |
| `greenledger-productor` | Dueño del proyecto forestal: recibe los créditos emitidos. |
| `greenledger-comprador` | Empresa que compra un crédito y lo retira para compensar sus emisiones. |

> Todos los comandos son de **una sola línea** y usan nombres de
> identidad y el alias `greenledger-demo` en vez de direcciones `G...` y
> `C...`. Así funcionan igual en bash, zsh y PowerShell. Tus direcciones
> `G...` van a ser distintas a las del ensayo; es normal.

### Datos del demo (ya están en el repo)

- `demo/certificado_demo.txt`: certificado ficticio, sin datos
  personales. Hace de "PDF del verificador": **nunca sube a la red**,
  solo su hash SHA-256:
  `04924ef9fbc16f3db1cf91dcc538b6e296554afc2c8d080d88a38e2ffcdd6875`
- `demo/lote_demo.json`: lote de 3 créditos (`DEMO002` 20 t, `DEMO003`
  15 t y `DEMO004` 25 t).

---

## Guion

### Paso 0 (opcional) — El certificado se queda fuera de la cadena

**Qué decir:** "El PDF del verificador puede tener datos sensibles. A la
blockchain solo va su huella digital."

bash / macOS:
```
sha256sum demo/certificado_demo.txt
```
PowerShell:
```
Get-FileHash demo/certificado_demo.txt -Algorithm SHA256
```

**Se espera:** `04924ef9…ffcdd6875`. PowerShell lo muestra en
mayúsculas; el contrato acepta ambas formas.

### Paso 1 — Desplegar una instancia nueva del contrato

**Qué decir:** "El código del contrato ya está publicado en testnet;
creamos una instancia nueva solo para este demo."

```
stellar contract deploy --wasm-hash d273c0d5e04827dda898160a3729c62621bddf26abfb0bcd24ca66806fd40d79 --source greenledger-admin --network testnet --alias greenledger-demo
```

**Se espera:**
```
✅ Transaction submitted successfully!
🔗 https://stellar.expert/explorer/testnet/tx/...
✅ Deployed!
CB4BRTDLTV5MKRVJBEHUDVGFTEPFA4A3KPDYKZLHYE4DDCT5XS62AEXO   ← tu Contract ID (será otro)
```

Abre el enlace 🔗 en el navegador para mostrar la transacción en el
explorador. Desde aquí, `greenledger-demo` apunta a este contrato.

### Paso 2 — Inicializar (fijar el admin)

```
stellar contract invoke --id greenledger-demo --source greenledger-admin --network testnet -- initialize --admin greenledger-admin
```

**Se espera:** `✅ Transaction submitted successfully!` y luego `null`
(la función no devuelve datos).

### Paso 3 — El admin autoriza al verificador

**Qué decir:** "Solo el admin decide quién puede certificar, y el
contrato exige su firma."

```
stellar contract invoke --id greenledger-demo --source greenledger-admin --network testnet -- agregar_verificador --verificador greenledger-verificador
```

**Se espera:** `✅ Transaction submitted successfully!` y luego `null`.

### Paso 4 — Emitir un crédito individual (100 t)

**Qué decir:** "El verificador emite el crédito `DEMO001` a nombre del
productor, amarrado al hash del certificado."

```
stellar contract invoke --id greenledger-demo --source greenledger-verificador --network testnet -- emitir_credito --verificador greenledger-verificador --id DEMO001 --propietario greenledger-productor --toneladas 100 --hash_certificado 04924ef9fbc16f3db1cf91dcc538b6e296554afc2c8d080d88a38e2ffcdd6875 --proyecto PROYDEMO
```

**Se espera:**
```
📅 ... - Success - Event: [{"symbol":"emitido"},{"symbol":"DEMO001"}] = {"vec":[{"address":"G…(productor)"},{"u32":100},{"symbol":"PROYDEMO"}]}
{"beneficiario_retiro":null, ..., "estado":"Emitido", "id":"DEMO001", "propietario":"G…(productor)", "proyecto":"PROYDEMO", "retirado_en":null, "toneladas":100, "verificador":"G…(verificador)"}
```

### Paso 5 — Emitir un lote (3 créditos, 60 t, una sola transacción)

**Qué decir:** "Una verificación suele respaldar varios créditos. El
lote es **todo o nada**: si uno falla, no se emite ninguno."

```
stellar contract invoke --id greenledger-demo --source greenledger-verificador --network testnet -- emitir_lote --verificador greenledger-verificador --propietario greenledger-productor --hash_certificado 04924ef9fbc16f3db1cf91dcc538b6e296554afc2c8d080d88a38e2ffcdd6875 --proyecto PROYDEMO --creditos-file-path demo/lote_demo.json
```

**Se espera:** un evento `emitido` por cada crédito, un evento resumen y
el total de toneladas del lote:
```
📅 ... Event: [{"symbol":"emitido"},{"symbol":"DEMO002"}] = ... {"u32":20} ...
📅 ... Event: [{"symbol":"emitido"},{"symbol":"DEMO003"}] = ... {"u32":15} ...
📅 ... Event: [{"symbol":"emitido"},{"symbol":"DEMO004"}] = ... {"u32":25} ...
📅 ... Event: [{"symbol":"lote_emitido"},{"symbol":"PROYDEMO"}] = {"vec":[… verificador, … productor, {"u32":3},{"u64":"60"}]}
60
```

### Paso 6 — El productor vende `DEMO001` al comprador

**Qué decir:** "Solo el dueño actual puede transferir; aquí firma el
productor."

```
stellar contract invoke --id greenledger-demo --source greenledger-productor --network testnet -- transferir_credito --id DEMO001 --nuevo_propietario greenledger-comprador
```

**Se espera:**
```
📅 ... Event: [{"symbol":"transferido"},{"symbol":"DEMO001"}] = {"vec":[{"address":"G…(productor)"},{"address":"G…(comprador)"}]}
{..., "estado":"Emitido", "id":"DEMO001", "propietario":"G…(comprador)", ...}
```

### Paso 7 — El comprador retira el crédito (compensa sus emisiones)

**Qué decir:** "Retirar es 'usar' la tonelada. Es irreversible y queda a
nombre de la empresa beneficiaria."

```
stellar contract invoke --id greenledger-demo --source greenledger-comprador --network testnet -- retirar_credito --id DEMO001 --beneficiario_retiro EMPRESA_DEMO
```

**Se espera:**
```
📅 ... Event: [{"symbol":"retirado"},{"symbol":"DEMO001"}] = {"vec":[{"address":"G…(comprador)"},{"symbol":"EMPRESA_DEMO"},{"u32":100}]}
{"beneficiario_retiro":"EMPRESA_DEMO", ..., "estado":"Retirado", ..., "retirado_en":1790350957, "toneladas":100, ...}
```

### Paso 8 — Consultar el historial de propiedad (trazabilidad pública)

**Qué decir:** "Cualquiera puede ver, sin firmar nada, la vida completa
del crédito: quién lo tuvo, cuándo y en qué ledger."

```
stellar contract invoke --id greenledger-demo --source greenledger-admin --network testnet --send=no -- historial_credito --id DEMO001 --desde 0 --limite 50
```

`--send=no` hace que sea solo una lectura: no se envía transacción ni se
paga comisión.

**Se espera** (una sola línea de JSON; aquí formateada):
```json
[
  { "tipo": "Emision",       "propietario_anterior": null,             "propietario": "G…(productor)", "beneficiario_retiro": null,           "ledger": 4865471, "timestamp": 1790350942 },
  { "tipo": "Transferencia", "propietario_anterior": "G…(productor)",  "propietario": "G…(comprador)", "beneficiario_retiro": null,           "ledger": 4865473, "timestamp": 1790350952 },
  { "tipo": "Retiro",        "propietario_anterior": "G…(comprador)",  "propietario": "G…(comprador)", "beneficiario_retiro": "EMPRESA_DEMO", "ledger": 4865474, "timestamp": 1790350957 }
]
```

### Paso 9 — Intentar el doble retiro (debe fallar) ✅

**Qué decir:** "Este es el problema que resuelve GreenLedger: vender o
contar dos veces la misma tonelada. Intentemos retirarla otra vez a
nombre de otra empresa."

```
stellar contract invoke --id greenledger-demo --source greenledger-comprador --network testnet -- retirar_credito --id DEMO001 --beneficiario_retiro OTRA_EMPRESA
```

**Se espera:**
```
❌ error: transaction simulation failed: HostError: Error(Contract, #5)
```

`#5` = **`CreditoRetirado`**. La red rechaza la operación al simularla,
antes de enviarla, y **no cobra nada**. El historial sigue con 3
movimientos.

---

## Extras (si sobra tiempo)

**Validar el certificado contra la cadena.** Devuelve `true` con el hash
original y `false` con el de cualquier otro documento:
```
stellar contract invoke --id greenledger-demo --source greenledger-admin --network testnet --send=no -- verificar_certificado --id DEMO001 --hash 04924ef9fbc16f3db1cf91dcc538b6e296554afc2c8d080d88a38e2ffcdd6875
```
Ojo: aquí el parámetro se llama `--hash`, no `--hash_certificado`.

**Un crédito retirado tampoco se puede transferir.** Da
`Error(Contract, #5)`:
```
stellar contract invoke --id greenledger-demo --source greenledger-comprador --network testnet -- transferir_credito --id DEMO001 --nuevo_propietario greenledger-productor
```

**Alguien que no es verificador intenta emitir.** Da
`Error(Contract, #2)` = `NoAutorizado`:
```
stellar contract invoke --id greenledger-demo --source greenledger-comprador --network testnet -- emitir_credito --verificador greenledger-comprador --id FALSO01 --propietario greenledger-comprador --toneladas 999 --hash_certificado 04924ef9fbc16f3db1cf91dcc538b6e296554afc2c8d080d88a38e2ffcdd6875 --proyecto PROYDEMO
```

**Totales y un crédito del lote.** Se espera `160`, `100` y
`DEMO003` con el mismo hash y proyecto que el resto del lote:
```
stellar contract invoke --id greenledger-demo --source greenledger-admin --network testnet --send=no -- total_emitido
stellar contract invoke --id greenledger-demo --source greenledger-admin --network testnet --send=no -- total_retirado
stellar contract invoke --id greenledger-demo --source greenledger-admin --network testnet --send=no -- verificar_credito --id DEMO003
```

---

## Códigos de error

| Código | Error | Cuándo aparece |
|---|---|---|
| `#1` | `YaInicializado` | `initialize` por segunda vez sobre el mismo contrato |
| `#2` | `NoAutorizado` | Emite quien no es verificador |
| `#3` | `CreditoYaExiste` | El id ya fue emitido (también dentro de un lote) |
| `#4` | `CreditoNoExiste` | Consultar u operar un id que no existe |
| `#5` | `CreditoRetirado` | Transferir o retirar un crédito ya retirado |
| `#6` | `ToneladasInvalidas` | `toneladas = 0` |
| `#7` | `MismoPropietario` | Transferir al dueño actual |
| `#8` | `LoteVacio` | Lote sin créditos |
| `#9` | `LoteDemasiadoGrande` | Lote de más de 25 créditos |

## Si algo falla en vivo

| Síntoma | Qué hacer |
|---|---|
| `Error(Contract, #1)` en el paso 2 o `#3` en los pasos 4–5 | Se está reusando un contrato que ya se usó. Repite el **paso 1**: crea una instancia limpia y `--alias` la sobrescribe. |
| `An identity with the name '...' already exists` al preparar | La cuenta ya existe; sigue adelante. |
| El paso 1 falla porque no encuentra el WASM (`wasm-hash`) | El código publicado pudo archivarse por TTL. Desde la raíz, despliega compilando: `stellar contract deploy --wasm contracts/greenledger/target/deploy/greenledger.wasm --source greenledger-admin --network testnet --alias greenledger-demo`, después de `cd contracts/greenledger && stellar contract build --out-dir target/deploy && cd ../..`. |
| Error de saldo o `account not found` | Vuelve a financiar la cuenta: `stellar keys fund <identidad> --network testnet`. |
| Friendbot o el RPC no responden | Espera unos segundos y reintenta; testnet a veces tarda. Ten abierto el [ensayo](#ensayo-verificado) como respaldo para mostrar. |
| PowerShell no encuentra `demo/lote_demo.json` | Revisa que la terminal esté en la raíz del repo (`Get-Location`). |

## Ensayo verificado

Ejecutado el 25-sep-2026 con `stellar-cli` 28.0.0 (protocolo 28), con
exactamente los comandos de arriba. Contrato del ensayo:
[`CB4BRTDLTV5MKRVJBEHUDVGFTEPFA4A3KPDYKZLHYE4DDCT5XS62AEXO`](https://stellar.expert/explorer/testnet/contract/CB4BRTDLTV5MKRVJBEHUDVGFTEPFA4A3KPDYKZLHYE4DDCT5XS62AEXO).

| Paso | Transacción |
|---|---|
| 1. Despliegue | [`60eb88e8…`](https://stellar.expert/explorer/testnet/tx/60eb88e8ae7a54082a508d9465e8b6e2ec84d62340c5de4ced9c9d02f63a464d) |
| 2. `initialize` | [`f0d293bd…`](https://stellar.expert/explorer/testnet/tx/f0d293bdecead8536b93e827e5083ef50ea8802fcb3baf55b652692780cee87b) |
| 3. `agregar_verificador` | [`89a6ac22…`](https://stellar.expert/explorer/testnet/tx/89a6ac222136c8f2cfd9c4843a10dc6e5df34abd21671e896762293ef55f0307) |
| 4. `emitir_credito` DEMO001 | [`f5b99cfe…`](https://stellar.expert/explorer/testnet/tx/f5b99cfe3ad6f2eaad690493602018c674517c44b74194b00d680165e0a6172f) |
| 5. `emitir_lote` DEMO002–004 | [`ec5c8b3c…`](https://stellar.expert/explorer/testnet/tx/ec5c8b3c22dbdf5f2322853493cee4cdc6f3b45aa143a4c1e17ef22098ae7a7f) |
| 6. `transferir_credito` | [`5fe542f0…`](https://stellar.expert/explorer/testnet/tx/5fe542f052dedcfb6a59cf62b095c1e6956981646a1eb8b81f648215ec124407) |
| 7. `retirar_credito` | [`bea5fdc9…`](https://stellar.expert/explorer/testnet/tx/bea5fdc94a605d661112ab72f3f4d1be695775d743eb7602d9e414885d1c05ac) |
| 8. Historial | lectura, sin transacción |
| 9. Doble retiro | rechazado en la simulación (`#5`), sin transacción |

Los extras también se ensayaron: `verificar_certificado` dio `true` con
el hash original (también en mayúsculas) y `false` con otro documento;
transferir un crédito retirado dio `#5`; la emisión de una cuenta que no
es verificador dio `#2`; y los totales fueron `160` emitido y `100`
retirado.
