//! Bridges `cargo test` to the TypeScript integration suite so that `cargo mutants` can
//! exercise lib.rs at all.
//!
//! WHY THIS EXISTS: mutation testing drives `cargo test`. Nothing on the Rust side touches
//! lib.rs — every instruction is exercised from TypeScript against a validator. Without this
//! bridge all 14 lib.rs mutants would "survive", and that survival would mean "no Rust test
//! reaches this code", not "your assertions are weak". A mutation score that measures the
//! absence of a harness rather than the strength of a suite is worse than no score, because
//! it reads like one.
//!
//! ⚠️ Requires a validator on 127.0.0.1:8899. Skips (passes) if none is reachable rather than
//! failing — a missing validator is an ENVIRONMENT fact, and reporting it as a mutant kill
//! would mark every mutant caught for the wrong reason.
use std::process::Command;

fn workspace_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap()
}

fn validator_up() -> bool {
    Command::new("curl")
        .args(["-s", "-m", "3", "-X", "POST", "http://127.0.0.1:8899",
               "-H", "Content-Type: application/json",
               "-d", r#"{"jsonrpc":"2.0","id":1,"method":"getHealth"}"#])
        .output().map(|o| String::from_utf8_lossy(&o.stdout).contains("ok")).unwrap_or(false)
}

#[test]
fn ts_integration_suite() {
    if !validator_up() {
        eprintln!("no validator on 127.0.0.1:8899 — skipping (environment, not a result)");
        return;
    }
    let root = workspace_root();
    // cargo-mutants builds in a scratch copy that excludes target/, so `anchor build` there
    // generates a FRESH program keypair while the source still says declare_id!(HSWCC…).
    // The deploy then fails with DeclaredProgramIdMismatch — which reads as a program bug and
    // is actually a missing file. Seed the scratch tree with the real keypair.
    // ⛔ Passed by PATH in an env var, never committed: this keypair authorises upgrades.
    if let Ok(kp) = std::env::var("STOCKPUMP_PROGRAM_KEYPAIR") {
        let dest = root.join("target/deploy");
        let _ = std::fs::create_dir_all(&dest);
        let dst = dest.join("stockpump-keypair.json");
        // ⛔ GUARD, AND IT COST ME THE KEYPAIR ONCE: in the real tree src IS dst, and
        // fs::copy onto itself TRUNCATES the file to zero. A program keypair is
        // unrecoverable; on mainnet that is a program that can never be upgraded again.
        // Compare canonical paths, and only copy when the destination is genuinely missing.
        let same = std::fs::canonicalize(&kp).ok() == std::fs::canonicalize(&dst).ok()
            && std::fs::canonicalize(&kp).is_ok();
        if !same && std::fs::metadata(&dst).map(|m| m.len() == 0).unwrap_or(true) {
            std::fs::copy(&kp, &dst).expect("failed to seed program keypair");
        }
    }
    let sh = |cmd: &str| -> bool {
        Command::new("bash").arg("-lc").arg(cmd).current_dir(&root)
            .env("PATH", format!("{}/.local/share/solana/install/active_release/bin:{}",
                 std::env::var("HOME").unwrap(), std::env::var("PATH").unwrap_or_default()))
            .status().map(|s| s.success()).unwrap_or(false)
    };
    // ./build.sh, not `anchor build`: anchor drives cargo-build-sbf with the DEFAULT
    // platform-tools (v1.51, cargo 1.84) and there is no override — `anchor build --
    // --tools-version vX` forwards the flag to the IDL's cargo test, which rejects it, while
    // leaving a stale .so on disk whose hash can still look correct. build.sh does the two
    // steps explicitly on v1.55 and prints the ELF flags so a codegen change cannot pass quietly.
    // ⛔ INLINE, not ./build.sh. cargo-mutants runs in a scratch copy and the script was not
    // reliably there — the baseline died with "No such file or directory" and cargo-mutants
    // reported it as "cargo test failed in an unmutated tree", which reads as a broken suite.
    // Depending on a sibling FILE inside a harness that runs in a COPIED TREE is the bug; the
    // two commands are short enough to carry directly.
    assert!(sh("cargo-build-sbf --tools-version v1.55 --manifest-path programs/stockpump/Cargo.toml"),
            "sbf build failed");
    // `-o` does not create the directory, and target/ is not copied into the scratch tree, so
    // this failed with a bare "No such file or directory" that named neither the path nor the
    // step. Fourth baseline failure on this bridge; all four were a missing file in the copy.
    assert!(sh("mkdir -p target/idl && anchor idl build -o target/idl/stockpump.json"), "idl build failed");
    assert!(sh("anchor deploy --provider.cluster http://127.0.0.1:8899"), "deploy failed");
    let home = std::env::var("HOME").unwrap();
    assert!(
        sh(&format!("ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET={home}/.config/solana/id.json \
                     npx ts-mocha -p ./tsconfig.json -t 1000000 tests/stockpump.spec.ts")),
        "TS integration suite failed",
    );
}
