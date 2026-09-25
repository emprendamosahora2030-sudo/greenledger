<#
.SYNOPSIS
    GreenLedger v2 — Script de despliegue en TESTNET de Stellar (Soroban)
    para Windows PowerShell. Equivalente a scripts/deploy_testnet.sh.

.DESCRIPTION
    1. Compila el contrato a WASM optimizado (stellar contract build).
    2. Crea (o reutiliza) la identidad "greenledger-admin" financiada con
       Friendbot en testnet.
    3. Crea (o reutiliza) "greenledger-comprador" para probar la
       transferencia.
    4. Despliega el contrato y llama initialize(admin).
    5. Registra al admin como verificador autorizado.
    6. Emite el crédito de ejemplo "CRED001" (100 toneladas) con un hash
       de prueba.
    7. Transfiere ese crédito a "greenledger-comprador".
    8. Retira el crédito a nombre de "EMPRESA_DEMO".

.NOTES
    Requiere stellar-cli (`stellar`) instalado y en el PATH, y acceso de
    red a los servicios de testnet de Stellar. Solo para testnet: nunca
    apuntes este script a mainnet sin revisar cada paso, y nunca subas al
    repositorio las llaves secretas (S...) que `stellar keys` guarda
    localmente.
#>

$ErrorActionPreference = "Stop"

# --- Configuración -------------------------------------------------------
$Red = "testnet"
$AdminId = "greenledger-admin"
$CompradorId = "greenledger-comprador"
$CreditoId = "CRED001"
$Toneladas = "100"
$Proyecto = "PROY001"
$BeneficiarioRetiro = "EMPRESA_DEMO"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$ContractDir = Join-Path $RepoRoot "contracts/greenledger"

function Get-ExplorerContract($id) { "https://stellar.expert/explorer/testnet/contract/$id" }
function Get-ExplorerAccount($addr) { "https://stellar.expert/explorer/testnet/account/$addr" }

Write-Host "== 1/8 Compilando contrato a WASM optimizado =="
# --out-dir deja el .wasm final en una ruta fija, sin depender de la
# carpeta de destino de cargo (wasm32v1-none, wasm32-unknown-unknown...).
# Desde stellar-cli v23 `build` ya optimiza el WASM por defecto.
$OutDir = Join-Path $ContractDir "target/deploy"
Push-Location $ContractDir
try {
    stellar contract build --out-dir $OutDir
}
finally {
    Pop-Location
}
$WasmPath = Join-Path $OutDir "greenledger.wasm"
if (-not (Test-Path $WasmPath)) {
    throw "No se encontró $WasmPath. ¿Falló la compilación?"
}
Write-Host "WASM: $WasmPath"

Write-Host "== 2/8 Identidad admin ($AdminId) =="
$adminExiste = $true
try { stellar keys address $AdminId | Out-Null } catch { $adminExiste = $false }
if (-not $adminExiste) {
    stellar keys generate $AdminId --network $Red --fund
}
else {
    Write-Host "La identidad '$AdminId' ya existe, se reutiliza."
}
$AdminAddr = (stellar keys address $AdminId).Trim()
Write-Host "Admin: $AdminAddr ($(Get-ExplorerAccount $AdminAddr))"

Write-Host "== 3/8 Identidad comprador de prueba ($CompradorId) =="
$compradorExiste = $true
try { stellar keys address $CompradorId | Out-Null } catch { $compradorExiste = $false }
if (-not $compradorExiste) {
    stellar keys generate $CompradorId --network $Red --fund
}
else {
    Write-Host "La identidad '$CompradorId' ya existe, se reutiliza."
}
$CompradorAddr = (stellar keys address $CompradorId).Trim()
Write-Host "Comprador: $CompradorAddr ($(Get-ExplorerAccount $CompradorAddr))"

Write-Host "== 4/8 Desplegando contrato =="
$ContractId = (stellar contract deploy `
    --wasm $WasmPath `
    --source $AdminId `
    --network $Red).Trim()
Write-Host "Contract ID: $ContractId"
Write-Host "Explorador: $(Get-ExplorerContract $ContractId)"

Write-Host "== 5/8 initialize(admin) =="
stellar contract invoke --id $ContractId --source $AdminId --network $Red -- initialize --admin $AdminAddr

Write-Host "== 6/8 agregar_verificador(admin) =="
stellar contract invoke --id $ContractId --source $AdminId --network $Red -- agregar_verificador --verificador $AdminAddr

Write-Host "== 7/8 emitir_credito($CreditoId, ${Toneladas}t) =="
# Hash de prueba: SHA-256 de un texto de ejemplo. En un caso real este
# hash es el SHA-256 del certificado PDF real emitido por el verificador,
# calculado fuera de la cadena (el PDF nunca se sube a la red).
$Sha256 = [System.Security.Cryptography.SHA256]::Create()
$Bytes = [System.Text.Encoding]::UTF8.GetBytes("certificado-demo-CRED001")
$HashBytes = $Sha256.ComputeHash($Bytes)
$HashCertificado = -join ($HashBytes | ForEach-Object { $_.ToString("x2") })
Write-Host "Hash de prueba: $HashCertificado"

stellar contract invoke --id $ContractId --source $AdminId --network $Red -- emitir_credito `
    --verificador $AdminAddr `
    --id $CreditoId `
    --propietario $AdminAddr `
    --toneladas $Toneladas `
    --hash_certificado $HashCertificado `
    --proyecto $Proyecto

Write-Host "== 8/8a transferir_credito($CreditoId -> comprador) =="
stellar contract invoke --id $ContractId --source $AdminId --network $Red -- transferir_credito `
    --id $CreditoId `
    --nuevo_propietario $CompradorAddr

Write-Host "== 8/8b retirar_credito($CreditoId -> $BeneficiarioRetiro) =="
stellar contract invoke --id $ContractId --source $CompradorId --network $Red -- retirar_credito `
    --id $CreditoId `
    --beneficiario_retiro $BeneficiarioRetiro

Write-Host ""
Write-Host "============================================================"
Write-Host " Despliegue completo"
Write-Host "============================================================"
Write-Host "Contract ID:         $ContractId"
Write-Host "Explorador:          $(Get-ExplorerContract $ContractId)"
Write-Host "Admin:               $AdminAddr"
Write-Host "Comprador de prueba: $CompradorAddr"
Write-Host "Crédito de ejemplo:  $CreditoId ($Toneladas t, retirado a nombre de $BeneficiarioRetiro)"
Write-Host ""
Write-Host "Los hashes de cada transacción los imprime 'stellar contract invoke'"
Write-Host "en su propia salida. Con cada hash de transacción arma el enlace:"
Write-Host "  https://stellar.expert/explorer/testnet/tx/<HASH_DE_LA_TX>"
