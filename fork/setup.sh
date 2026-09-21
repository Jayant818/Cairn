#!/usr/bin/env bash
# Local fork carrying the real SPYx and USDC mints, funded test accounts, and
# deterministic oracle fixtures for the Cairn lifecycle.
#
# WHY A FORK AT ALL: the local harness is a MODEL of SPYx. It got the extensions right and the
# token PROGRAM wrong, and that defect survived four commits and a green suite. A fork removes
# the modelling step for the mints themselves.
#
# ⛔ THE HARD PART IS NOT CLONING, IT IS HOLDING. External issuers control both live mint
# authorities, so the fixture generator creates correctly encoded test ATAs and loads them
# at genesis. The real mint accounts remain byte-for-byte mainnet clones.
#
# ⚠️ WHAT THIS DOES AND DOES NOT PROVE. The MINTS are real: real extensions, real decimals,
# real owning programs. The BALANCES are fabricated, so nothing here tests issuance, and a
# transfer hook that consults issuer state would still be modelled rather than exercised.
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

SPYX=XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W
USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
MAINNET=https://api.mainnet-beta.solana.com
FIXTURES=fork/generated
LEDGER="${CAIRN_LEDGER:-fork-ledger}"
WALLET_PATH="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
WALLET_ADDRESS=$(solana address --keypair "$WALLET_PATH")

node fork/generate-cairn-fixtures.mjs "$WALLET_ADDRESS" "$FIXTURES"

ARGS=(--reset --quiet --ledger "$LEDGER" --url "$MAINNET" --clone "$SPYX" --clone "$USDC")
for account in "$FIXTURES"/*.json; do
  [ "${account##*/}" = "manifest.json" ] && continue
  ADDRESS=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).pubkey)' "$account")
  ARGS+=(--account "$ADDRESS" "$account")
done

exec solana-test-validator "${ARGS[@]}" "$@"
