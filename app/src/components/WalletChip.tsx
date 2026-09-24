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

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: Event) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`wallet-chip${delta ? " wallet-chip-flash" : ""}${open ? " wallet-chip-open" : ""}`} data-tour="wallet">
      <button type="button" className="wallet-chip-button" aria-expanded={open} aria-controls="wallet-detail" onClick={() => setOpen(!open)}>
        <span className="wallet-chip-label">{label}</span>
        <strong>{fmt(wallet.spyx, 8, 2)} SPYx</strong>
        <span aria-hidden="true">▾</span>
      </button>
      <dl className="wallet-pop" id="wallet-detail">
        {ASSETS.map(({ id, unit, decimals, shown }) => (
          <div key={id}><dt>{unit}</dt><dd>{fmt(wallet[id], decimals, shown)}</dd></div>
        ))}
      </dl>
      <span className="wallet-chip-delta" role="status" aria-live="polite">{delta?.text ?? ""}</span>
    </div>
  );
}
