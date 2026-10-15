# MVP funcional — GreenLedger

## Evidencias verificables

- **Producto en línea:** https://greenledger-app-emprendamosahora2030-5355s-projects.vercel.app
- **Propuesta para la Universidad del Tolima (validación académica):** https://greenledger-tolima.vercel.app/
- **Video demo + pitch:** pendiente; no se grabó en esta semana. Se publicará en la siguiente iteración.
- **Contrato vigente (v2, Soroban, testnet):** https://stellar.expert/explorer/testnet/contract/CANJ564LVB4WBAYJWXRQKHJII456RW6XBWWM2FQCSSC6HLG27JP2A5O2
- **Admin en dos pasos:** https://stellar.expert/explorer/testnet/contract/CBZOZEFKCZDTP4JR23LEA3IRT2QMARPET3ZR74IKEBGYKXTCNVC46YPH
- **Admin multifirma 2-de-3:** https://stellar.expert/explorer/testnet/contract/CCJWT5XBUIU6IPOCC6GDQC5LLC5XRGGB7NUC2AOCVZWZE3HGB5FKPX3T
- **Transacciones testnet del ciclo de vida (CRED001):**
  - Emisión: https://stellar.expert/explorer/testnet/tx/f44c5d29996505cee9617830556c071a79c426355a8dc570e42370739df10085
  - Transferencia: https://stellar.expert/explorer/testnet/tx/46b390088672549155d0dd8fb0348031824bdcdb9b9fc6b73838c1a299538e53
  - Retiro: https://stellar.expert/explorer/testnet/tx/2b0c25f20d583f0cdf78d786ff69723ac95cb42ab311e18276a05fe233d7d6cb
  - Emisión por lotes (LOTE001..003): https://stellar.expert/explorer/testnet/tx/d51fdd99948bd7b25fae5db6a0ddf2eea0ec106d983300848e50a47e46c7be74
  - Lote de 25 créditos: https://stellar.expert/explorer/testnet/tx/3bdc3696780c5e635ce1bc7362b5e505dba9d5baa6ff87b4a2a86b231cd2ecc8
- **Pruebas automatizadas:** 34 pruebas del contrato, ejecutadas en CI (`.github/workflows/test.yml`).
- **Repositorio:** https://github.com/emprendamosahora2030-sudo/greenledger

## 1. Aprendizajes y ajustes priorizados

Retomamos la decisión del Entregable 3: un contrato propio, con ciclo de vida controlado en cadena (Emitido → Transferido → Retirado) para impedir la doble venta y la doble contabilidad. Esa decisión ya está implementada en el front y probada de punta a punta en testnet.

Aprendimos tres cosas. Primero, un registro sin gobernanza no inspira confianza: un solo administrador era el punto débil más evidente, así que priorizamos el cambio de admin en dos pasos (el candidato debe aceptar, y un error de dirección no deja el contrato sin dueño) y una cuenta admin multifirma 2-de-3. Segundo, emitir créditos uno a uno no escala para un proyecto real; por eso añadimos emisión por lotes de hasta 25 créditos. Tercero, un comprador necesita ver quién fue el dueño de cada crédito, por lo que incorporamos el historial de propiedad y el certificado con hash SHA-256.

Ajustes aplicados: contrato v2 con 34 pruebas, historial de propiedad, lotes, roles de verificador, README reorganizado y verificación automática en CI. Dejamos para después la integración con RENARE y la capa de pagos, hasta validar el flujo central con usuarios reales.

## 2. Riesgos y pendientes

**Técnicos.** El contrato opera solo en testnet y no ha sido auditado por un tercero; no debe manejar créditos reales sin esa auditoría. El CI ejecuta las pruebas, pero aún no compila a WASM; es un pendiente conocido. Hay además una inconsistencia menor de licencia entre el repositorio (MIT) y el manifiesto del contrato (Apache-2.0) que debe alinearse.

**De gobernanza.** La administración multifirma 2-de-3 funciona, pero con llaves de prueba. Antes de mainnet hay que definir tres firmantes reales e independientes. Un verificador no debe ser firmante del admin, porque el admin autoriza a los verificadores y habría conflicto de intereses.

**De negocio y regulación.** Los créditos registrados son de demostración; no representan toneladas reales. Para ser un registro creíble se necesita un proyecto real con datos reales, validado por un organismo acreditado por el ONAC (ISO 14065) y alineado a un estándar como Cercarbono, Verra o BCR. Aún no hay convenio firmado con verificadores, universidades ni entidades públicas.

**De ejecución.** El proyecto lo desarrolla una sola persona, así que el alcance se mantiene mínimo. La preparación para SCF en Stellar Apex va en 5 de 7 criterios; faltan un Instaward completado y tres entregables verificados.

**Pendientes inmediatos:** grabar el video demo, definir los tres firmantes reales, contactar a un organismo verificador y seleccionar un proyecto piloto.

## 3. Plan de validación con usuarios

**Usuarios objetivo.** (a) Organismos de verificación y desarrolladores de proyectos de carbono, que emiten y registran créditos; (b) empresas compradoras, que necesitan comprobar que un crédito es único y retirarlo a su nombre; (c) autoridades ambientales y alcaldías, que consultan el registro y lo usan para soportar compensaciones locales.

**Hipótesis.** Un registro público con historial inmutable y certificado verificable reduce el tiempo y la desconfianza al comprobar un crédito, frente a hojas de cálculo y PDF enviados por correo.

**Cómo lo haremos.** En las próximas tres semanas realizaremos entre 6 y 8 entrevistas de 20 minutos: dos con verificadores o desarrolladores de proyecto, dos con empresas compradoras y dos o tres con funcionarios ambientales o investigadores universitarios. En cada sesión mostraremos el producto en línea y pediremos tres tareas sin ayuda: consultar un crédito de ejemplo, verificar un certificado y retirar un crédito de demostración con Freighter.

**Qué mediremos.** Porcentaje de personas que completan cada tarea; tiempo por tarea; punto exacto donde dudan (en especial la firma de la transacción); y una pregunta final: "¿qué necesitaría para usar esto con un crédito real?".

**Criterio de éxito.** Al menos 5 de cada 8 completan consultar y verificar sin ayuda, y al menos dos organizaciones aceptan evaluar un piloto con un proyecto real.

**Qué haremos con los resultados.** Corregiremos las tres fricciones principales, documentaremos las respuestas en el repositorio y, si hay interés de un verificador acreditado, prepararemos el piloto con un solo proyecto, previa auditoría del contrato.
