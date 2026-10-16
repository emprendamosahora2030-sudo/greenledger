# MVP funcional — GreenLedger

## Evidencias verificables

- **Producto en línea:** https://greenledger-app-emprendamosahora2030-5355s-projects.vercel.app
- **Landing / pitch en vivo:** https://greenledger-tolima.vercel.app/
- **Video demo + pitch (≤ 3 min):** https://youtu.be/5mdFQP8r7Q0
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

**Pendientes inmediatos:** definir los tres firmantes reales, contactar a un organismo verificador y seleccionar un proyecto piloto.

## 3. Plan de validación con usuarios

**A quién.** Cinco personas por cada perfil de usuario: (a) verificadores o desarrolladores de proyectos de carbono, (b) empresas compradoras y (c) funcionarios ambientales. Se contactan por la red del equipo, en sesiones de 20 minutos por videollamada, con permiso por escrito y sin guardar datos personales de más.

**Hipótesis (umbrales fijados antes de ver resultados).**
1. Creemos que una empresa compradora consultará el historial de un crédito antes de comprarlo, porque hoy se fía del vendedor. Lo sabremos si 4 de 5 consultan un crédito de prueba sin que se les pida.
2. Creemos que un verificador emitirá un crédito desde su cuenta sin ayuda. Lo sabremos si 4 de 5 completan la emisión con Freighter en menos de 5 minutos.
3. Creemos que un funcionario ambiental comprobará un certificado PDF contra el hash registrado. Lo sabremos si 3 de 5 lo logran sin ayuda.

**Cómo se observa.** La tarea es un escenario, no una instrucción: "Te llega un crédito de un proveedor y decides si lo compras". Una persona dirige la sesión y un colaborador anota, y nadie ayuda ni señala botones. Se pregunta por hechos del pasado ("cuéntame de la última vez que verificaste un crédito"), no por opiniones sobre el producto.

**Qué se registra.** Tarea completada (sí o no), tiempo, errores de firma y el punto exacto donde la persona se traba, con la observación separada de la interpretación. Cada fricción se prioriza por gravedad, frecuencia y esfuerzo de arreglo.

**Decisión.** Si una hipótesis no alcanza su umbral, se corrige primero el paso con más fricción (probablemente la firma) y se repite con nuevas personas. Si se cumple la primera, el siguiente paso es un piloto con un proyecto real, previa auditoría del contrato.
