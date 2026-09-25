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
#   9. Consulta el historial de propiedad del crédito (lectura, sin firma).
#
# Requisitos: stellar-cli (`stellar`) v23 o superior (probado con v28.0.0)
# instalado y en el PATH, y acceso de
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
# --out-dir deja el .wasm final en una ruta fija, sin depender de la
# carpeta de destino de cargo (wasm32v1-none, wasm32-unknown-unknown...).
# Desde stellar-cli v23 `build` ya optimiza el WASM por defecto.
OUT_DIR="$CONTRACT_DIR/target/deploy"
stellar contract build --out-dir "$OUT_DIR"
WASM_PATH="$OUT_DIR/greenledger.wasm"
if [ ! -f "$WASM_PATH" ]; then
  echo "No se encontró $WASM_PATH. ¿Falló la compilación?" >&2
  exit 1
fi
echo "WASM: $WASM_PATH"

echo "== 2/8 Identidad admin (${ADMIN_ID}) =="
if ! stellar keys address "$ADMIN_ID" >/dev/null 2>&1; then
  stellar keys generate "$ADMIN_ID" --network "$RED" --fund
else
  echo "La identidad '$ADMIN_ID' ya existe, se reutiliza."
fi
ADMIN_ADDR="$(stellar keys address "$ADMIN_ID")"
echo "Admin: $ADMIN_ADDR ($(explorer_account "$ADMIN_ADDR"))"

echo "== 3/8 Identidad comprador de prueba (${COMPRADOR_ID}) =="
if ! stellar keys address "$COMPRADOR_ID" >/dev/null 2>&1; then
  stellar keys generate "$COMPRADOR_ID" --network "$RED" --fund
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

echo "== 9 historial_credito(${CREDITO_ID}) =="
# Lectura pública: se simula, no se envía transacción ni cobra comisión.
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_ID" \
  --network "$RED" \
  --send=no \
  -- historial_credito \
  --id "$CREDITO_ID" \
  --desde 0 \
  --limite 50

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
