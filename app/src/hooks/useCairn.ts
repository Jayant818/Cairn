import { useCallback, useEffect, useMemo, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { MarketConfig } from "../lib/cairnMath";
import { getCairnProgram } from "../lib/anchorClient";
import { requestTestAssets } from "../lib/faucet";
import { fetchLive, probeLive } from "../lib/liveMarket";
import {
  PAPER_CONFIG,
  accrueInterest,
  advanceTime,
  borrow,
  clearState,
  deposit,
  depositCollateral,
  genesisState,
  liquidateOwn,
  liquidateSample,
  liquidationLimits,
  loadState,
  movePrice,
  pricesFor,
  resetPrice,
  writeOffSample,
  parseAmount,
  redeem,
  repay,
  saveState,
  viewOf,
  withdrawCollateral,
  type MarketState,
  type PaperEvent,
  type PaperState,
  type Position,
  type Wallet,
} from "../lib/paperMarket";
import {
  executeAccrueInterest,
  executeBorrow,
  executeDeposit,
  executeDepositCollateral,
  executeRedeem,
  executeRepay,
  executeWithdrawCollateral,
  explorerTransactionUrl,
} from "../lib/transactions";

export type Mode = "paper" | "live";
export type ActionName = "deposit" | "redeem" | "collateral" | "withdraw" | "borrow" | "repay" | "accrue";

type LiveSnapshot = { market: MarketState; position: Position; wallet: Wallet; config: MarketConfig };

function requestedMode(): Mode | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("mode");
  return value === "paper" || value === "live" ? value : null;
}

function isLocalPage() {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

const paperActions = {
  deposit: (s: PaperState, v: string) => deposit(s, parseAmount(v, 8)),
  redeem: (s: PaperState, v: string) => redeem(s, parseAmount(v, 8)),
  collateral: (s: PaperState, v: string) => depositCollateral(s, parseAmount(v, 6)),
  withdraw: (s: PaperState, v: string) => withdrawCollateral(s, parseAmount(v, 6)),
  borrow: (s: PaperState, v: string) => borrow(s, parseAmount(v, 8)),
  repay: (s: PaperState, v: string) => repay(s, parseAmount(v, 8)),
  accrue: (s: PaperState) => accrueInterest(s),
} satisfies Record<ActionName, (s: PaperState, v: string) => PaperState>;

// A saved session from an older build, or edited storage, must not break the page.
function restorePaper(): PaperState {
  const saved = loadState();
  try {
    if (saved && typeof saved.now === "bigint" && Array.isArray(saved.events)
      && typeof saved.equityPrice === "bigint" && saved.sample) {
      viewOf(saved.market, saved.position, saved.wallet);
      return saved;
    }
  } catch {
    // fall through to a fresh market
  }
  return genesisState();
}

export function useCairn() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const forced = requestedMode();
  // Paper is the default. Live is used only when a Cairn market answers on the configured RPC.
  const [mode, setMode] = useState<Mode>(forced === "live" ? "live" : "paper");
  const [paper, setPaper] = useState<PaperState>(restorePaper);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    // A public page must not probe the visitor's localhost: browsers log a refused
    // connection and may ask for local-network permission. Probe only when the page is
    // local itself or a deployment names its own RPC.
    if (forced || !(import.meta.env?.VITE_RPC_URL || isLocalPage())) return;
    let cancelled = false;
    void probeLive(connection).then((found) => {
      if (!cancelled && found) setMode("live");
    });
    return () => { cancelled = true; };
  }, [connection, forced]);

  const refreshLive = useCallback(async () => {
    setLive(await fetchLive(connection, wallet.publicKey ?? null));
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    // Syncs with an external system (the RPC). The state update lands after the fetch resolves.
    // oxlint-disable-next-line react/set-state-in-effect
    if (mode === "live") void refreshLive().catch((reason) => setError(String(reason)));
  }, [mode, refreshLive]);

  useEffect(() => {
    if (mode === "paper") saveState(paper);
  }, [mode, paper]);

  const program = useMemo(
    () => (anchorWallet ? getCairnProgram(connection, anchorWallet) : null),
    [anchorWallet, connection],
  );

  const run = useCallback(async (name: ActionName, value = "") => {
    setError(null);
    if (mode === "paper") {
      try {
        setPaper(paperActions[name](paper, value));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return;
    }
    if (!program || !wallet.publicKey) {
      setError("Connect a wallet to sign live transactions.");
      return;
    }
    const owner = wallet.publicKey;
    const liveActions: Record<ActionName, () => Promise<string>> = {
      deposit: () => executeDeposit(program, owner, value),
      redeem: () => executeRedeem(program, owner, value),
      collateral: () => executeDepositCollateral(program, owner, value),
      withdraw: () => executeWithdrawCollateral(program, owner, value),
      borrow: () => executeBorrow(program, owner, value),
      repay: () => executeRepay(program, owner, value),
      accrue: () => executeAccrueInterest(program),
    };
    setBusy(true);
    try {
      setSignature(await liveActions[name]());
      await refreshLive();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [mode, paper, program, wallet.publicKey, refreshLive]);

  const advance = useCallback((days: number) => {
    setError(null);
    setPaper((current) => advanceTime(current, BigInt(days) * 86_400n));
  }, []);

  // Paper-only market events: the oracle move and liquidations. Each reports its program error.
  const paperOnly = useCallback((apply: (state: PaperState) => PaperState) => {
    setError(null);
    try {
      setPaper(apply(paper));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [paper]);

  const reset = useCallback(() => {
    clearState();
    setError(null);
    setPaper(genesisState());
  }, []);

  const seed = useCallback(async () => {
    if (!wallet.publicKey) return setError("Connect a wallet first.");
    setBusy(true);
    try {
      setSignature((await requestTestAssets(wallet.publicKey)).tokenSignature);
      await refreshLive();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [wallet.publicKey, refreshLive]);

  const source = mode === "live" && live ? live : { ...paper, config: PAPER_CONFIG };
  const prices = mode === "live" ? pricesFor() : pricesFor(paper.equityPrice);
  const view = viewOf(source.market, source.position, source.wallet, source.config, prices);
  const empty = { spyx: 0n, usdc: 0n, cspyx: 0n };
  const sampleView = viewOf(paper.market, paper.sample, empty, PAPER_CONFIG, prices);
  const liquidation = {
    own: liquidationLimits(paper, paper.position),
    sample: liquidationLimits(paper, paper.sample),
  };
  const events: PaperEvent[] = mode === "paper" ? paper.events : [];

  return {
    mode,
    ready: mode === "paper" || live !== null,
    connected: Boolean(wallet.connected),
    view,
    config: source.config,
    now: mode === "paper" ? paper.now : live?.market.lastAccrual ?? 0n,
    events,
    busy,
    error,
    transactionUrl: signature ? explorerTransactionUrl(signature, connection.rpcEndpoint) : null,
    run: (name: ActionName, value = "") => void run(name, value),
    equityPrice: mode === "live" ? null : paper.equityPrice,
    prices,
    sampleView,
    liquidation,
    movePrice: (percent: number) => paperOnly((s) => movePrice(s, BigInt(percent))),
    resetPrice: () => paperOnly(resetPrice),
    liquidateSample: (amount: bigint) => paperOnly((s) => liquidateSample(s, amount)),
    liquidateOwn: () => paperOnly(liquidateOwn),
    writeOffSample: () => paperOnly(writeOffSample),
    advance,
    reset,
    seed,
  };
}
