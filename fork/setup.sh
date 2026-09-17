#!/usr/bin/env bash
# Task 7 — mainnet fork carrying the REAL SPYx and USDY mints, with holdings.
#
# WHY A FORK AT ALL: the local harness is a MODEL of SPYx. It got the extensions right and the
# token PROGRAM wrong, and that defect survived four commits and a green suite. A fork removes
# the modelling step for the mints themselves.
#
# ⛔ THE HARD PART IS NOT CLONING, IT IS HOLDING. Backed holds SPYx's mint authority and Ondo
# holds USDY's, so no test wallet can ever be ISSUED either token. Phase 1 (fork/phase1.sh)
# clones the mints, creates REAL ATAs for the test wallet — creating an ATA needs no mint
# authority — dumps them, and rewrites the amount field at offset 64. This script is phase 2:
# it reloads those edited accounts at genesis, so the wallet begins holding tokens it could
# never have been minted.
#
# ⚠️ WHAT THIS DOES AND DOES NOT PROVE. The MINTS are real: real extensions, real decimals,
# real owning programs. The BALANCES are fabricated, so nothing here tests issuance, and a
# transfer hook that consults issuer state would still be modelled rather than exercised.
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

SPYX=XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W
USDY=A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6
MAINNET=https://api.mainnet-beta.solana.com

ARGS=(--reset --quiet --ledger fork-ledger --url "$MAINNET" --clone "$SPYX" --clone "$USDY")
# Reload the edited ATAs only if phase 1 has produced them.
for n in spyx usdy; do
  if [ -f "fork/$n-ata.json" ]; then
    ADDR=$(python3 -c "import json;print(json.load(open('fork/$n-ata.json'))['pubkey'])")
    ARGS+=(--account "$ADDR" "fork/$n-ata.json")
  fi
done

exec solana-test-validator "${ARGS[@]}" "$@"
