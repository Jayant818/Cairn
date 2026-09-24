import type { Mode } from "../hooks/useCairn";

type RibbonProps = {
  mode: Mode;
  day: number;
  progress: string;
  feedbackHref: string;
  onAdvance: (days: number) => void;
  onReset: () => void;
  onAccrue: () => void;
  busy: boolean;
};

export function SandboxRibbon({ mode, day, progress, feedbackHref, onAdvance, onReset, onAccrue, busy }: RibbonProps) {
  return (
    <section className="sandbox-ribbon" aria-label="Cairn trading mode">
      <div className="sandbox-ribbon-inner">
        <div className="sandbox-title">
          <small>{progress}</small>
        </div>
        <div className="ribbon-tools">
          {mode === "paper" ? (
            <>
              <span className="ribbon-day">Day {day}</span>
              <button type="button" onClick={() => onAdvance(1)}>Skip 1 day</button>
              <button type="button" onClick={() => onAdvance(30)}>Skip 30 days</button>
              <button type="button" onClick={onReset}>Reset</button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={onAccrue}>Accrue interest</button>
          )}
          <a href={feedbackHref} target="_blank" rel="noreferrer">Found a problem?</a>
          {mode === "paper"
            ? <span className="paper-badge">Paper trading · simulated, no real funds</span>
            : <span className="live-badge">Live · local fork, wallet-signed</span>}
        </div>
      </div>
    </section>
  );
}
