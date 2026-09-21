#!/usr/bin/env bash
# Deploy the program to devnet as INDEPENDENT EVIDENCE, separate from the frontend.
#
# WHY THIS EXISTS AND WHY IT IS NOT WHAT THE UI READS: a deployed program id a judge can
# open in an explorer is cheap, checkable proof that the program is real and on a public
# cluster. It is NOT the demo's data source: devnet has no SPYx, so anything
# transacting there would be against MODEL mints, which is the substitution that let a green
# suite agree with broken code for four commits. Deploy the program; keep the demo on the fork.
#
# ⛔ REQUIRES --yes. Deploying spends real devnet SOL and puts an artifact on a public
# cluster, so it does not happen by accident or by a stray shell-history arrow key.
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

URL=${DEVNET_URL:-https://api.devnet.solana.com}
# ⛔ ALWAYS EXPLICIT. The machine's global solana config carries a RELATIVE keypair path from
# a different project plus its own cluster, so a bare `solana` here has no signer and the
# wrong network — and it fails as "No default signer found", which reads as a missing wallet.
KEYPAIR=${SOLANA_KEYPAIR:-$HOME/.config/solana/id.json}
PROGRAM_ID=$(solana address -k target/deploy/cairn-keypair.json)

if [ "${1:-}" != "--yes" ]; then
  echo "DRY RUN — pass --yes to actually deploy."
  echo "  cluster     $URL"
  echo "  deployer    $(solana address -k "$KEYPAIR")"
  echo "  balance     $(solana balance -u "$URL" -k "$KEYPAIR")"
  echo "  program id  $PROGRAM_ID"
  echo "  .so         $(stat -c %s target/deploy/cairn.so) bytes"
  echo "  rent needed $(solana rent $((45 + 2 * $(stat -c %s target/deploy/cairn.so))) -u "$URL" | head -1)"
  solana account "$PROGRAM_ID" -u "$URL" -k "$KEYPAIR" >/dev/null 2>&1 \
    && echo "  state       ALREADY DEPLOYED — this would be an UPGRADE, not a first deploy" \
    || echo "  state       absent — first deploy"
  exit 0
fi

./build.sh
anchor deploy --provider.cluster "$URL" --provider.wallet "$KEYPAIR"

# ⛔ VERIFY BY BYTES, NOT BY THE DEPLOY'S EXIT CODE. A deploy can report success and still
# leave a different program if a write was partial — and a program id that resolves to the
# wrong bytes is worse evidence than no program id at all.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
solana -u "$URL" program dump "$PROGRAM_ID" "$TMP/on-chain.so" >/dev/null
if cmp -s "$TMP/on-chain.so" target/deploy/cairn.so; then
  echo "VERIFIED: on-chain bytes are identical to target/deploy/cairn.so"
else
  echo "⛔ MISMATCH: on-chain bytes differ from the local build. Do not publish this id." >&2
  exit 1
fi

echo
echo "program id  $PROGRAM_ID"
echo "explorer    https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
