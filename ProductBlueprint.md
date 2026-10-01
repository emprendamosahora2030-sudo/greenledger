# GreenLedger — Product Blueprint

## Priorización de historias

Criterio de priorización: impacto regulatorio (Decreto 973/2026) + madurez técnica ya probada en testnet. La historia de prevención de doble-conteo encabeza el backlog porque es el fundamento técnico sobre el que dependen todas las demás (certificación, auditoría, escalamiento institucional).

1. Bloqueo automático de doble-conteo (operador)
2. Emisión de token único por tonelada de CO₂ (generador de créditos)
3. Verificación on-chain por auditor regulatorio
4. Certificado de tokenización verificable (comprador)
5. Dashboard del ciclo completo (jurado/evaluador)
6. Verificación previa a compra (comprador corporativo)
7. Integración institucional con aliados (Cercarbono, RIA, Masbosques)

## Propuesta de valor

GreenLedger resuelve el problema central del mercado de carbono en Colombia: la falta de trazabilidad confiable que permite el doble-conteo o la doble-venta de un mismo crédito. Hoy, la verificación depende de reportes manuales y registros centralizados vulnerables a errores o manipulación. GreenLedger tokeniza cada crédito de carbono como un activo único en la red Stellar, mediante un contrato inteligente Soroban que impide técnicamente su duplicación: una vez emitido, transferido o retirado, el historial queda registrado de forma inmutable y verificable públicamente por cualquier parte, sin depender de la buena fe del emisor.

A diferencia de los registros tradicionales (hojas de cálculo, bases de datos centralizadas o certificados en papel), GreenLedger ofrece verificación pública en tiempo real: cualquier comprador, auditor o regulador puede confirmar el estado exacto de un crédito —emitido, transferido, verificado o retirado— consultando directamente la blockchain, sin intermediarios. Esto conecta directamente con el usuario identificado en el Problem Brief: compradores corporativos que necesitan evidencia auditable de su compensación ambiental, y reguladores que deben hacer cumplir el Decreto 973 de 2026 sin capacidad de fiscalización manual a gran escala. El resultado es confianza verificable por diseño, no por declaración.

## Flujo de usuario

1. **Generador** (proyecto forestal/RIA) solicita verificación de hectáreas reforestadas/toneladas de CO₂ capturadas.
2. **Verificador** (ej. TEMIS o entidad certificadora) valida los datos de campo.
3. **Emisión**: se crea el token único en Stellar/Soroban representando el crédito verificado (activo = crédito, cantidad = toneladas CO₂).
4. **Comprador corporativo** consulta el contrato en testnet/mainnet y confirma que el crédito no ha sido vendido antes.
5. **Transferencia**: el crédito pasa del generador al comprador; la transacción queda registrada de forma inmutable.
6. **Certificación**: el comprador recibe un certificado digital verificable (como el emitido para CRED001) con enlace a la transacción on-chain.
7. **Retiro/cierre**: al usarse como compensación, el crédito se marca como retirado, bloqueando cualquier reventa futura — cierre del ciclo.

## Alcance del MVP

**Dentro del MVP:** contrato Soroban con ciclo completo (emisión → transferencia → verificación → retiro) y protección anti-doble-conteo — ya desplegado y probado en testnet (Contract ID CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y); certificado de tokenización verificable por crédito; consulta pública del historial on-chain vía exploradores de Stellar.

**Fuera del MVP (deseable, no crítico):** interfaz web completa para generadores/compradores no técnicos (hoy la interacción es vía contrato/CLI); integración automatizada con fuentes de datos satelitales de verificación forestal; dashboard analítico con métricas agregadas del mercado; onboarding de múltiples verificadores simultáneos (hoy un solo verificador, TEMIS, como punto de partida).

**Justificación:** el valor diferencial de GreenLedger no está en la interfaz, sino en la garantía criptográfica de no-duplicación. Un MVP sin interfaz pulida pero con el contrato probado on-chain ya demuestra el argumento regulatorio central ante jurado y aliados; la interfaz se puede construir después sin alterar la lógica de confianza ya validada.

## Lean Canvas

| Bloque | Contenido |
|---|---|
| **Problema** | Doble-conteo/doble-venta de créditos de carbono; falta de trazabilidad verificable exigida por el Decreto 973/2026 |
| **Segmento de usuarios** | Compradores corporativos que compensan emisiones; proyectos forestales/RIA generadores de créditos; reguladores y auditores (MinAmbiente, TEMIS) |
| **Propuesta de valor única** | Trazabilidad inmutable y verificable públicamente por diseño, no por confianza en el emisor |
| **Solución** | Tokenización de créditos como activo único en Stellar/Soroban con contrato anti-doble-conteo |
| **Canales** | Alianzas institucionales (Cercarbono, RIA, Masbosques), Stellar Apex, Ruta N / Viceministerio TIC |
| **Métricas clave** | Créditos emitidos, transferencias verificadas, intentos de doble-conteo bloqueados, aliados institucionales activos |
| **Ventaja diferencial** | Contrato ya desplegado y probado on-chain (no es solo propuesta); patrón reutilizable (base de TemisLedger) |
| **Estructura de costos e ingresos** | Costos: infraestructura testnet/mainnet, verificación de campo. Ingresos: comisión por tokenización/transacción, licenciamiento del patrón a terceros |

Imagen: [`LeanCanvas_GreenLedger.png`](./LeanCanvas_GreenLedger.png)

## Backlog priorizado (Kanban)

Tablero: [GreenLedger — Backlog](https://github.com/users/emprendamosahora2030-sudo/projects/1) — las 7 historias priorizadas, cada una con su criterio de aceptación en la descripción de la tarjeta.

## Arquitectura inicial

La arquitectura tiene tres capas. **Interfaz**: punto de interacción con generadores, compradores y verificadores (hoy vía CLI/Stellar Lab; interfaz web queda fuera del MVP). **Lógica de negocio**: el contrato inteligente Soroban, que define las reglas del ciclo de vida del crédito (emisión, transferencia, verificación, retiro) y aplica la protección anti-doble-conteo directamente a nivel de contrato, no de aplicación externa. **Red Stellar**: la capa donde el contrato se despliega y ejecuta; cada transacción (emisión, transferencia, retiro) queda registrada de forma inmutable en el ledger de Stellar, consultable públicamente vía Stellar Expert o Stellar Lab. La red entra en el punto crítico del flujo: cada cambio de estado del crédito (no solo su creación) se escribe on-chain, de modo que el historial completo —no solo el estado final— es auditable por cualquier tercero sin depender de GreenLedger como intermediario de confianza.

## Uso de Stellar y justificación

GreenLedger usa **Soroban** (los contratos inteligentes de Stellar) para codificar las reglas del ciclo de vida del crédito, incluida la protección anti-doble-conteo a nivel de protocolo —no de base de datos administrada, lo que elimina la posibilidad de alteración unilateral por el operador. Usa el **ledger de Stellar** como registro inmutable y de consulta pública: cada transacción quedar verificable sin depender de GreenLedger como fuente de verdad. Se apoya en **Stellar Expert / Stellar Lab** como exploradores públicos para que compradores, auditores y reguladores verifiquen el estado de un crédito de forma independiente. Esta elección responde directamente al criterio de pertinencia del Problem Brief: el problema identificado (falta de trazabilidad confiable) exige una solución donde la confianza no dependa de una entidad central, y Stellar/Soroban ofrece costos de transacción bajos, velocidad adecuada para un registro transaccional, y un ecosistema con herramientas de verificación pública ya maduras — condiciones necesarias para que el argumento regulatorio ante el Decreto 973/2026 sea creíble ante jurado y aliados institucionales.
