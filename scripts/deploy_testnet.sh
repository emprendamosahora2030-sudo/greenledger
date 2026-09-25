#!/usr/bin/env bash
# =============================================================================
# GreenLedger v2 — Script de despliegue en TESTNET de Stellar (Soroban)
# =============================================================================
# Qué hace, en orden:
#   1. Compila el contrato a WASM optimizado (stellar contract build).
#   2. Crea (o reutiliza) la identidad "greenledger-admin" y la financia
#      con Friendbot en testnet.
#   3. Crea (o reutiliza) una segunda identidad "greenledger-comprador"
#      para probar la transferencia.
#   4. Despliega el contrato y llama initialize(admin).
#   5. Registra al admin como verificador autorizado.
#   6. Emite el crédito de ejemplo "CRED001" (100 toneladas) con un hash
#      de prueba.
#   7. Transfiere ese crédito a "greenledger-comprador".
#   8. Retira el crédito a nombre de "EMPRESA_DEMO".
#
# Requisitos: stellar-cli (`stellar`) instalado y en el PATH, y acceso de
# red a horizon-testnet.stellar.org / friendbot.stellar.org / soroban RPC
# de testnet.
#
# IMPORTANTE: este script es SOLO para testnet. Nunca lo apuntes a mainnet
# sin revisar cada paso, y nunca subas al repositorio las llaves secretas
# (S...) que `stellar keys` guarda localmente.
# =============================================================================

set -euo pipefail

# --- Configuración -----------------------------------------------------
RED="testnet"
ADMIN_ID="greenledger-admin"
COMPRADOR_ID="greenledger-comprador"
CREDITO_ID="CRED001"
TONELADAS="100"
PROYECTO="PROY001"
BENEFICIARIO_RETIRO="EMPRESA_DEMO"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACT_DIR="$REPO_ROOT/contracts/greenledger"

explorer_contract() { echo "https://stellar.expert/explorer/testnet/contract/$1"; }
explorer_account() { echo "https://stellar.expert/explorer/testnet/account/$1"; }

echo "== 1/8 Compilando contrato a WASM optimizado =="
cd "$CONTRACT_DIR"
stellar contract build

# La carpeta de destino (wasm32v1-none, wasm32-unknown-unknown, etc.)
# depende de la versión de stellar-cli, así que se busca el .wasm en vez
# de asumir una ruta fija.
WASM_PATH="$(find "$REPO_ROOT/target" -type f -name "greenledger.wasm" -path "*/release/*" ! -name "*.optimized.wasm" | head -n1)"
if [ -z "$WASM_PATH" ]; then
  echo "No se encontró greenledger.wasm bajo $REPO_ROOT/target. ¿Falló la compilación?" >&2
  exit 1
fi
stellar contract optimize --wasm "$WASM_PATH" || true
WASM_OPTIMIZADO="${WASM_PATH%.wasm}.optimized.wasm"
if [ -f "$WASM_OPTIMIZADO" ]; then
  WASM_PATH="$WASM_OPTIMIZADO"
fi
echo "WASM: $WASM_PATH"

echo "== 2/8 Identidad admin (${ADMIN_ID}) =="
if ! stellar keys address "$ADMIN_ID" >/dev/null 2>&1; then
  stellar keys generate --global "$ADMIN_ID" --network "$RED" --fund
else
  echo "La identidad '$ADMIN_ID' ya existe, se reutiliza."
fi
ADMIN_ADDR="$(stellar keys address "$ADMIN_ID")"
echo "Admin: $ADMIN_ADDR ($(explorer_account "$ADMIN_ADDR"))"

echo "== 3/8 Identidad comprador de prueba (${COMPRADOR_ID}) =="
if ! stellar keys address "$COMPRADOR_ID" >/dev/null 2>&1; then
  stellar keys generate --global "$COMPRADOR_ID" --network "$RED" --fund
else
  echo "La identidad '$COMPRADOR_ID' ya existe, se reutiliza."
fi
COMPRADOR_ADDR="$(stellar keys address "$COMPRADOR_ID")"
echo "Comprador: $COMPRADOR_ADDR ($(explorer_account "$COMPRADOR_ADDR"))"

echo "== 4/8 Desplegando contrato =="
CONTRACT_ID="$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source "$ADMIN_ID" \
  --network "$RED")"
echo "Contract ID: $CONTRACT_ID"
echo "Explorador: $(explorer_contract "$CONTRACT_ID")"

echo "== 5/8 initialize(admin) =="
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_ID" \
  --network "$RED" \
  -- initialize --admin "$ADMIN_ADDR"

echo "== 6/8 agregar_verificador(admin) =="
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_ID" \
  --network "$RED" \
  -- agregar_verificador --verificador "$ADMIN_ADDR"

echo "== 7/8 emitir_credito(${CREDITO_ID}, ${TONELADAS}t) =="
# Hash de prueba: SHA-256 de un texto de ejemplo. En un caso real este
# hash es el SHA-256 del certificado PDF real emitido por el verificador,
# calculado fuera de la cadena (el PDF nunca se sube a la red).
HASH_CERTIFICADO="$(printf '%s' 'certificado-demo-CRED001' | sha256sum | cut -d' ' -f1)"
echo "Hash de prueba: $HASH_CERTIFICADO"

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_ID" \
  --network "$RED" \
  -- emitir_credito \
  --verificador "$ADMIN_ADDR" \
  --id "$CREDITO_ID" \
  --propietario "$ADMIN_ADDR" \
  --toneladas "$TONELADAS" \
  --hash_certificado "$HASH_CERTIFICADO" \
  --proyecto "$PROYECTO"

echo "== 8/8a transferir_credito(${CREDITO_ID} -> comprador) =="
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_ID" \
  --network "$RED" \
  -- transferir_credito \
  --id "$CREDITO_ID" \
  --nuevo_propietario "$COMPRADOR_ADDR"

echo "== 8/8b retirar_credito(${CREDITO_ID} -> ${BENEFICIARIO_RETIRO}) =="
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$COMPRADOR_ID" \
  --network "$RED" \
  -- retirar_credito \
  --id "$CREDITO_ID" \
  --beneficiario_retiro "$BENEFICIARIO_RETIRO"

echo ""
echo "============================================================"
echo " Despliegue completo"
echo "============================================================"
echo "Contract ID:      $CONTRACT_ID"
echo "Explorador:        $(explorer_contract "$CONTRACT_ID")"
echo "Admin:              $ADMIN_ADDR"
echo "Comprador de prueba:$COMPRADOR_ADDR"
echo "Crédito de ejemplo: $CREDITO_ID ($TONELADAS t, retirado a nombre de $BENEFICIARIO_RETIRO)"
echo ""
echo "Los hashes de cada transacción los imprime 'stellar contract invoke'"
echo "en su propia salida (líneas 'Signing transaction:' / 'status: SUCCESS')."
echo "Con cada hash de transacción puedes armar el enlace:"
echo "  https://stellar.expert/explorer/testnet/tx/<HASH_DE_LA_TX>"
