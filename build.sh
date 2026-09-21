#!/usr/bin/env bash
# Build the program. Two steps on purpose, and the reason matters:
#
#   anchor build drives cargo-build-sbf with the DEFAULT platform-tools (v1.51, cargo 1.84),
#   and there is no env var to override it. `anchor build -- --tools-version vX` forwards the
#   flag to the IDL's `cargo test` instead, which rejects it. So the .so is built explicitly on
#   v1.55 (cargo 1.89) and the IDL is built separately. The IDL build runs on the HOST
#   toolchain (1.93), so it never needed the pins in the first place.
#
# v1.51 stays in ~/.cache/solana. Rollback is one flag.
# Artifact check across the upgrade, pins unchanged so the toolchain was the only variable:
#   v1.51  md5 3b93c25c...  341392 B  Flags 0x0
#   v1.55  md5 414c7fe1...  321952 B  Flags 0x0   <- SAME SBPF version, 5.7% smaller
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
TOOLS="${SBF_TOOLS_VERSION:-v1.55}"
cd "$(dirname "$0")"
cargo-build-sbf --tools-version "$TOOLS" --manifest-path programs/cairn/Cargo.toml
anchor idl build -p cairn -o target/idl/cairn.json
echo "built on platform-tools $TOOLS"
readelf -h target/deploy/cairn.so | grep -E "Flags"
