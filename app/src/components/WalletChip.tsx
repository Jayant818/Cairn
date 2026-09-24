import { useEffect, useRef, useState } from "react";
import { fmt, type Wallet } from "../lib/paperMarket";

type Delta = { key: number; text: string };

const ASSETS = [
  { id: "spyx", unit: "SPYx", decimals: 8, shown: 4 },
  { id: "usdc", unit: "USDC", decimals: 6, shown: 2 },
  { id: "cspyx", unit: "cSPYx", decimals: 8, shown: 4 },
] as const;

// Always-visible balances. After each action it flashes and shows what changed,
// so the user sees the result of every step without scrolling.
export function WalletChip({ wallet, label }: { wallet: Wallet; label: string }) {
  const previous = useRef(wallet);
  const [delta, setDelta] = useState<Delta | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = wallet;
    const changes = ASSETS
      .map(({ id, unit, decimals, shown }) => {
        const diff = wallet[id] - before[id];
        return diff === 0n ? null : `${diff > 0n ? "+" : ""}${fmt(diff, decimals, shown)} ${unit}`;
      })
      .filter(Boolean);
    if (!changes.length) return;
    const next = { key: Date.now(), text: changes.join("  ") };
    // Syncs with the wallet prop. The flash is transient UI, not derived state.
    // oxlint-disable-next-line react/set-state-in-effect
    setDelta(next);
    const timer = setTimeout(() => setDelta((current) => (current?.key === next.key ? null : current)), 2_600);
    return () => clearTimeout(timer);
  }, [wallet]);

  return (
    <div className={`wallet-chip${delta ? " wallet-chip-flash" : ""}`} data-tour="wallet" aria-label={label}>
      <span className="wallet-chip-label">{label}</span>
      <span className="wallet-chip-values">
        {ASSETS.map(({ id, unit, decimals, shown }) => (
          <span key={id}><strong>{fmt(wallet[id], decimals, shown)}</strong> {unit}</span>
        ))}
      </span>
      <span className="wallet-chip-delta" role="status" aria-live="polite">{delta?.text ?? ""}</span>
    </div>
  );
}
