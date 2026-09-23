import type { Mode } from "../hooks/useCairn";

export type GuideStep = { label: string; done: boolean; target: "Lend" | "Borrow" | "time" };

type RibbonProps = {
  mode: Mode;
  clock: string;
  steps: GuideStep[];
  feedbackHref: string;
  onStep: (target: GuideStep["target"]) => void;
  onAdvance: (days: number) => void;
  onReset: () => void;
  onAccrue: () => void;
  busy: boolean;
};

export function SandboxRibbon({ mode, clock, steps, feedbackHref, onStep, onAdvance, onReset, onAccrue, busy }: RibbonProps) {
  const next = steps.findIndex((step) => !step.done);
  return (
    <section className="sandbox-ribbon" aria-label="Cairn trading mode">
      <div className="sandbox-ribbon-inner">
        <div className="sandbox-title">
          {mode === "paper"
            ? <strong className="paper-badge">PAPER — simulated, no real funds</strong>
            : <strong className="live-badge">LIVE — local fork, wallet-signed</strong>}
          <small>{mode === "paper" ? `Clock ${clock}` : "Your local validator"}</small>
        </div>
        <ol className="scenario-steps" aria-label="Guided lifecycle">
          {steps.map((step, index) => (
            <li key={step.label}>
              <button
                type="button"
                className={step.done ? "scenario-done" : index === next ? "scenario-active" : ""}
                onClick={() => onStep(step.target)}
              >
                <span>{step.done ? "✓" : index + 1}</span>{step.label}
              </button>
            </li>
          ))}
        </ol>
        <div className="ribbon-tools">
          {mode === "paper" ? (
            <>
              <button type="button" onClick={() => onAdvance(1)}>+1 day</button>
              <button type="button" onClick={() => onAdvance(30)}>+30 days</button>
              <button type="button" onClick={onReset}>Reset</button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={onAccrue}>Crank interest</button>
          )}
          <a href={feedbackHref} target="_blank" rel="noreferrer">Found a problem?</a>
        </div>
      </div>
    </section>
  );
}
