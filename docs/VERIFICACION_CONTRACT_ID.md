# Verificación de Contract ID

GreenLedger vive en **Stellar testnet**. Hay varios contratos desplegados a lo largo del proyecto; esta guía dice cuál es cuál y cómo comprobar que cada documento cita el que le corresponde.

El código **no** tiene ningún Contract ID escrito a mano: los scripts de despliegue crean uno nuevo cada vez. Los IDs solo aparecen en documentos, y la fuente única de verdad es [`config/contracts.json`](../config/contracts.json).

## Contratos registrados

Lectura en cadena del 2026-10-06 (solo lectura, `stellar-cli --send=no`, hecha por el mantenedor).

| Alias | Contract ID | Estado | total_emitido | total_retirado |
|---|---|---|---|---|
| `v2-vigente` | `CANJ564LVB4WBAYJWXRQKHJII456RW6XBWWM2FQCSSC6HLG27JP2A5O2` | **vigente** | 485 | 100 |
| `v2-primera-instancia` | `CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y` | reemplazado | 100 | 100 |
| `v2-sin-lotes` | `CDYAQU4BG5WARTWX6CVILBDAWHU52YP4HHRRL2HICTC6725Y4ZNGGCQF` | reemplazado | 100 | 100 |
| `v1` | `CCRM3PZEMJMZLIM5B6SRMNILPDACR4KEHFS6ODBGHDPVOFNPK7B2XSWT` | legado | n/d | n/d |
| `ensayo-demo-2026-09-25` | `CB4BRTDLTV5MKRVJBEHUDVGFTEPFA4A3KPDYKZLHYE4DDCT5XS62AEXO` | ensayo | 160 | 100 |

### Nota sobre v1

**v1 tiene una interfaz distinta de v2.** No expone `total_emitido` ni `total_retirado` (la CLI responde `unrecognized subcommand`), así que sus totales no se pueden leer con esas funciones. v1 no se modifica. Está registrado con `funciones_ausentes` en `config/contracts.json`.

### Certificado CRED001

El certificado CRED001 cita **v1**, y eso está **confirmado en cadena** (2026-10-06): CRED001 existe en v1, emitido, 100 t, con la transacción de emisión `949082bb…` (ledger 4844772, 2026-09-24). La evidencia está en `creditos_observados` de `config/contracts.json`.

**Problema conocido — CRED001 duplicado.** El mismo ID `CRED001` también existe en v2 (`v2-vigente`) con otros datos: estado retirado, otro propietario, otro hash de certificado y emitido el 2026-09-25. Está registrado en `known_issues` como *reportado, decisión pendiente del CEO*. El checklist marca "Activo único" de CRED001 como ADVERTENCIA, nunca como PASA.

## Verificar

```bash
node scripts/check-contract-id.mjs                       # el repositorio
node scripts/check-contract-id.mjs --external-dir <dir>  # + pitch y certificados (viven fuera del repo)
node scripts/check-contract-id.mjs --strict              # las diferencias conocidas también fallan
node scripts/check-contract-id.mjs --require-external    # falla si faltan los externos
node --test "tests/*.test.mjs"                           # pruebas (sin red)
```

Sin dependencias (Node ≥ 18). No usa red: valida cada ID con su checksum (StrKey/CRC16) y lo compara con el esperado **para ese documento** (`config/doc-expectations.json`), no con una variable global.

| Resultado | Significado |
|---|---|
| `OK` | El documento cita solo IDs permitidos y todos los obligatorios |
| `DIFERENCIA` | ID malformado (typo), desconocido, inesperado, faltante, documento no registrado, o `CURRENT_CONTRACT_ID` distinto del vigente |
| `CONOCIDO` | Diferencia ya reportada en `known_issues`; código 0, falla con `--strict` |
| `OMITIDO` | Documento externo no encontrado |
| `SECRETO` | Hay algo con forma de clave secreta de Stellar (`S…`); el valor nunca se imprime |
| `AVISO` | Un `known_issue` ya no se produce y se puede retirar |

Códigos de salida: `0` sin diferencias nuevas · `1` diferencias · `2` error de configuración o de uso.

## Cambiar de contrato vigente

1. Edita `config/contracts.json`: pasa el anterior a `reemplazado` y marca el nuevo como `vigente` (debe haber exactamente uno).
2. Actualiza `CURRENT_CONTRACT_ID` en `.env.example`.
3. Corre `node scripts/check-contract-id.mjs --strict` y corrige los documentos que señale.

## Reglas del repositorio

- Solo testnet. Las claves de cuentas Stellar van **solo** en variables de entorno o en `stellar keys`, nunca en archivos del repo (el script avisa si encuentra una).
- Los IDs de este archivo están permitidos por `config/doc-expectations.json`; cualquier otro documento debe declarar qué ID cita.
