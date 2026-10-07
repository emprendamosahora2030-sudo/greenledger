# Soroban hola-mundo en testnet (PowerShell) — Blockchain Builders 101, Ruta N

Solo testnet. Nunca ejecutes `stellar keys show alice` ni compartas la clave secreta (S...).
Si un comando usa otra bandera en tu versión, corre `stellar contract <comando> --help`.

## 0. Verificación previa
```powershell
cd soroban-practica
stellar --version
rustc --version
rustup target list --installed      # debe incluir wasm32v1-none
stellar keys address alice          # solo muestra la clave PÚBLICA (G...)
stellar keys fund alice --network testnet   # opcional; si ya está fondeada puede avisar que existe
```
Por qué: confirmas herramientas y que alice existe, sin tocar la clave secreta.

## 1. Crear el proyecto
```powershell
stellar contract init hola-mundo
cd hola-mundo
```
Crea un proyecto Rust con el contrato de ejemplo en `contracts\hello-world`.
Su función `hello(to: String)` devuelve el vector `["Hello", to]`.

## 2. Compilar
```powershell
stellar contract build
```
Convierte Rust en WebAssembly (WASM), el formato que corre la red.
Resultado: `target\wasm32v1-none\release\hello_world.wasm`.

Errores típicos:
- `can't find crate for core` / target faltante → `rustup target add wasm32v1-none`.
- `linker not found` → faltan las Build Tools de Visual Studio (C++).

## 3. Desplegar en testnet con alice
```powershell
stellar contract deploy `
  --wasm target\wasm32v1-none\release\hello_world.wasm `
  --source-account alice `
  --network testnet `
  --alias hola_ruta_n
```
Sube el WASM y crea el contrato. Alice firma y paga la comisión (en XLM de prueba).
La salida termina con el **Contract ID** (empieza por `C`, 56 caracteres).
Antes verás una línea tipo `Signing transaction: <hash>` o un enlace de explorer: ese es el **hash de la transacción**.
`--alias` guarda un nombre corto para no copiar el ID.

## 4. Invocar
Personalizado (reemplaza por tu nombre):
```powershell
stellar contract invoke `
  --id hola_ruta_n `
  --source-account alice `
  --network testnet `
  -- hello --to "TuNombre-RutaN"
```
Resultado esperado: `["Hello","TuNombre-RutaN"]`.
El `--` separa las opciones de la CLI de la función del contrato (`hello`) y sus argumentos (`--to`).

## 5. Contract ID, hash y enlaces
```powershell
stellar contract alias show hola_ruta_n    # imprime el Contract ID
```
El hash sale en la salida del deploy o del invoke (línea `Signing transaction:`).

Enlaces (reemplaza los valores):
- Contrato: `https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`
- Transacción: `https://stellar.expert/explorer/testnet/tx/<TX_HASH>`

## Resumen (5 líneas)
1. `stellar contract init` creó el proyecto con un contrato de ejemplo.
2. `stellar contract build` lo compiló a WASM.
3. `stellar contract deploy` lo publicó en testnet firmado por alice.
4. `stellar contract invoke ... hello --to` lo ejecutó y devolvió el saludo.
5. Con el Contract ID y el hash lo verificas en stellar.expert (testnet).
