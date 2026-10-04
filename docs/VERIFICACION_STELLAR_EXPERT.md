# Procedimiento (NO ejecutado) — verificar el código de GreenLedger v2 en stellar.expert

Estado: borrador de preparación. Nada de esto se ha corrido. Los pasos de
stellar.expert / GitHub Actions deben confirmarse contra su documentación
vigente antes de ejecutarse (cambian con frecuencia; no pude consultarla
con certeza desde este entorno).

## 0. Qué se verifica
Se verifica **un WASM concreto**, no un nombre. Cada instancia en testnet
se creó con un WASM distinto:

| Instancia | WASM hash (según README) | Código fuente |
|---|---|---|
| CDQMO… (primera v2) | `b28739bc…dbef61` (9.990 B) | commit `64e0aee` (sin historial ni lotes) |
| CDYAQ… (v2 sin lotes) | no registrado en el README | commit `e66de36` |
| CANJ5… (v2 vigente) | `d273c0d5…fd40d79` (16.033 B) | commit `8755af5`/`2544285` en adelante (HEAD) |
| CCRM3… (v1) | desconocido | **no está en el repo** |
| CC7ZF… | desconocido | **no aparece en el repo ni en su historial** |

Solo se puede verificar v2 vigente (CANJ5…) y CDQMO…/CDYAQ… si se
reconstruye con su commit exacto. v1 y CC7ZF… no, hasta tener su fuente.

## 1. Fijar el estado del repositorio
1. Repo **público** (el README dice que ya lo es). Confirmar que `Cargo.lock` está versionado (lo está).
2. Crear un tag inmutable sobre el commit desplegado, p. ej. `v2.0.0-testnet`.
3. Añadir al `Cargo.toml`/build los metadatos del contrato (stellar-cli ≥ 23):
   `stellar contract build --meta source_repo=github:<org>/greenledger --meta home_domain=<dominio>`
   (confirmar sintaxis en la doc de stellar-cli). Esto cambia el WASM → **cambia el hash**.

## 2. Compilación reproducible
1. Opción recomendada por el ecosistema: workflow de GitHub Actions
   `stellar-expert/soroban-build-workflow`, que compila en entorno fijo y
   genera una **attestation** de GitHub enlazando repo, commit, workflow y WASM.
2. Fijar versiones: Rust (`rust-toolchain.toml`), `soroban-sdk = 22.0.0` (ya en Cargo.toml),
   `stellar-cli` (ver con `stellar --version`; el despliegue usó 28.0.0).
3. Perfil `release` ya tiene `lto`, `opt-level="z"`, `codegen-units=1`, `panic="abort"`.

## 3. Hash del WASM
1. Local: `sha256sum target/deploy/greenledger.wasm`.
2. On-chain: `stellar contract info ...` / buscar el hash del contrato en stellar.expert (pestaña Contract → WASM hash).
3. **Los dos deben ser idénticos.** Si no lo son, el WASM publicado no corresponde a ese código y NO se puede afirmar "verificado".

## 4. Importante: un WASM nuevo ≠ el desplegado
Si el hash on-chain actual (`d273c0d5…`) no se reproduce con el commit/tags
actuales, hay dos caminos: (a) encontrar la combinación exacta de
toolchain/CLI que lo reproduce, o (b) compilar con el workflow oficial,
**desplegar una instancia nueva** en testnet y verificar esa. (b) implica
desplegar → requiere tu autorización explícita y claves; no lo hice.

## 5. Qué debes publicar
- Repo público con: `contracts/greenledger/` completo, `Cargo.lock`, `rust-toolchain.toml`, workflow de build, LICENSE.
- Tag/release con el commit exacto, el WASM compilado y su SHA-256.
- Attestation del build (la genera el workflow).
- Tabla en README: Contract ID ↔ WASM hash ↔ commit/tag.
- NO publicar: llaves `S…`, frases semilla, `.env`, identidades de `stellar keys`.

## 6. Criterio para afirmar "verificado"
Solo si: (1) hash local = hash on-chain, (2) build reproducible por un tercero
con el tag, (3) stellar.expert muestra el estado de validación para ese contrato.
Hasta entonces, la frase correcta es "código fuente público; verificación pendiente".
