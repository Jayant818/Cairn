import { useMemo, useState } from "react";
import { borrowApy, lenderApy } from "../components/YieldCurve";

export type Persona = "Retail Lender" | "Institutional Borrower";

export type LiveSandboxActions = {
  connected: boolean;
  seed: () => Promise<string>;
  deposit: () => Promise<string>;
  borrow: () => Promise<string>;
  accrue: () => Promise<string>;
  redeem: () => Promise<string>;
};

type SimulatorState = {
  phase: number;
  persona: Persona;
  walletSpyx: number;
  walletUsdc: number;
  deposited: number;
  receipts: number;
  utilization: number;
  exchangeRate: number;
  mmDebt: number;
  mmCollateral: number;
  message: string;
};

const INITIAL_STATE: SimulatorState = {
  phase: 0,
  persona: "Retail Lender",
  walletSpyx: 0,
  walletUsdc: 0,
  deposited: 0,
  receipts: 0,
  utilization: 0,
  exchangeRate: 1,
  mmDebt: 0,
  mmCollateral: 0,
  message: "Viewing recorded market state. Connect a wallet to run sandbox transactions.",
};

export function useSimulator(live: LiveSandboxActions) {
  const [state, setState] = useState(INITIAL_STATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const run = async (action: () => Promise<string>, apply: () => void) => {
    if (!live.connected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextSignature = await action();
      setSignature(nextSignature);
      apply();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const seed = () => run(live.seed, () => setState({
    ...INITIAL_STATE,
    phase: 1,
    walletSpyx: 10,
    walletUsdc: 10_000,
    message: "Token-2022 extensions underwritten and approved by policy.rs.",
  }));

  const deposit = () => run(live.deposit, () => setState((current) => ({
    ...current,
    phase: Math.max(current.phase, 2),
    persona: "Retail Lender",
    walletSpyx: 5,
    deposited: 5,
    receipts: 5,
    utilization: 0,
    exchangeRate: 1,
    message: "5.00 SPYx deposited on-chain. The vault minted 5.00 cSPYx.",
  })));

  const borrowMarket = () => run(live.borrow, () => setState((current) => ({
    ...current,
    phase: Math.max(current.phase, 3),
    persona: "Institutional Borrower",
    utilization: 75,
    mmDebt: 3.75,
    mmCollateral: 1600,
    message: "1,600 USDC posted and 3.75 SPYx borrowed through the Cairn program.",
  })));

  const accrue = () => run(live.accrue, () => setState((current) => ({
    ...current,
    phase: Math.max(current.phase, 4),
    persona: "Retail Lender",
    exchangeRate: 1.0192,
    message: "On-chain interest cranked. The 1.0192 rate is the explicit 30-day scenario projection.",
  })));

  const redeem = () => run(live.redeem, () => setState((current) => ({
    ...current,
    phase: 5,
    walletSpyx: 10.096,
    deposited: 0,
    receipts: 0,
    utilization: 0,
    mmDebt: 0,
    mmCollateral: 0,
    message: "Debt repaid, 5.00 cSPYx burned, and the underlying SPYx redeemed.",
  })));

  const setPersona = (persona: Persona) => setState((current) => ({ ...current, persona }));
  const setUtilization = (utilization: number) => setState((current) => ({ ...current, utilization }));
  const rates = useMemo(() => ({
    borrow: borrowApy(state.utilization),
    lender: lenderApy(state.utilization),
  }), [state.utilization]);

  return {
    ...state,
    ...rates,
    connected: live.connected,
    busy,
    error,
    signature,
    positionValue: state.receipts * state.exchangeRate,
    managedEquity: state.deposited ? state.receipts * state.exchangeRate : 0,
    seed,
    deposit,
    borrowMarket,
    accrue,
    redeem,
    setPersona,
    setUtilization,
  };
}
