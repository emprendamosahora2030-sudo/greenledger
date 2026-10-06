# Lista de verificación por certificado

Cada certificado GreenLedger se revisa con 5 criterios. El estado de cada uno es **PASA**, **FALLA**, **PENDIENTE** (falta una comprobación que requiere la cadena) o **NO_APLICA**. Lo que necesita la cadena nunca se marca PASA sin haberla consultado.

```bash
node scripts/checklist-certificado.mjs <certificado.html>                 # texto
node scripts/checklist-certificado.mjs <certificado.html> --formato md    # tabla Markdown
node scripts/checklist-certificado.mjs <certificado.html> --formato json
node scripts/checklist-certificado.mjs <otro.html> --expect v2-vigente    # sin regla en config
node --test "tests/*.test.mjs"                                            # pruebas (sin red)
```

Salida: `0` sin FALLA · `1` al menos una FALLA · `2` error de uso o de configuración. PENDIENTE no hace fallar.

## Criterios

| Criterio | Qué comprueba | Sin red |
|---|---|---|
| `activo_unico` | El crédito existe una sola vez en el contrato (`verificar_credito`) | PENDIENTE (FALLA si el certificado no identifica el crédito) |
| `historial` | Emisión y transferencias coinciden con `historial_credito` | PENDIENTE |
| `retiro` | Si el certificado declara el crédito retirado, que la cadena lo confirme | PENDIENTE si lo declara; NO_APLICA si no |
| `enlace_verificacion_publica` | Hay enlace al contrato y a la transacción de emisión; host `lab.stellar.org` o `stellar.expert`, `https`, red `testnet`, hash de 64 hex, y el ID del enlace es el del certificado | PASA o FALLA por formato. **Que el enlace abra no se prueba sin red** |
| `contract_id_correcto` | El certificado cita solo el Contract ID esperado para ese documento (`config/doc-expectations.json`, sección `externos`) | FALLA si no coincide; PENDIENTE si coincide pero `confirmado_en_cadena` es `false`; PASA si coincide y es `true` |

## Cómo pasar de PENDIENTE a PASA

1. **Contract ID**: verificar en cadena que el crédito se emitió en el contrato del certificado (`verificar_credito` y la transacción de emisión). Luego poner `confirmado_en_cadena: true` en `config/doc-expectations.json` para ese certificado.
2. **Activo único e historial**: ejecutar `verificar_credito` e `historial_credito` sobre ese contrato (lectura, `--send=no`) y comparar con el certificado. Estas comprobaciones en cadena todavía no están automatizadas en este script.
3. **Retiro**: solo si el certificado lo declara; confirmar con `verificar_certificado`.

Un contrato v1 no expone las mismas funciones que v2 (ver `docs/VERIFICACION_CONTRACT_ID.md`); las comprobaciones en cadena de un certificado emitido en v1 deben hacerse con la interfaz de v1.

## Plantilla de informe por certificado

```
Certificado: <archivo>      Crédito: <ID>      Fecha: <AAAA-MM-DD>
| Criterio | Estado | Detalle |
|---|---|---|
| Activo único | | |
| Historial | | |
| Retiro | | |
| Enlace de verificación pública | | |
| Contract ID correcto | | |
Comprobado en cadena por: <persona>   Transacción de emisión: <hash>
```
