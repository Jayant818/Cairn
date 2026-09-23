import type { Persona } from "../hooks/useSimulator";

type SandboxActions = {
  phase: number;
  connected: boolean;
  busy: boolean;
  seed: () => Promise<void>;
  deposit: () => void;
  borrow: () => void;
  accrue: () => void;
};

const steps = [
  "Get Test Assets",
  "Stake Stock",
  "Simulate MM Borrow",
  "Accrue Yield",
] as const;

export function SandboxRibbon({ phase, connected, busy, seed, deposit, borrow, accrue }: SandboxActions) {
  const actions = [seed, deposit, borrow, accrue];
  return (
    <section className="sandbox-ribbon" aria-label="Cairn protocol sandbox walkthrough">
      <div className="sandbox-ribbon-inner">
        <div className="sandbox-title">
          <span aria-hidden="true">🧪</span>
          <strong>Cairn Protocol Sandbox</strong>
          <small>Verified fork replay</small>
        </div>
        <div className="scenario-steps">
          {steps.map((label, index) => {
            const step = index + 1;
            const done = phase >= step;
            const enabled = connected && !busy && phase >= index && !done;
            return (
              <button
                type="button"
                className={done ? "scenario-done" : enabled ? "scenario-active" : ""}
                disabled={!enabled}
                onClick={() => void actions[index]()}
                key={label}
              >
                <span>{done ? "✓" : step}</span>{label}
              </button>
            );
          })}
        </div>
        {!connected && <div className="sandbox-disconnected">Connect wallet to enable transactions</div>}
      </div>
    </section>
  );
}

export function PersonaSwitcher({
  value,
  onChange,
}: {
  value: Persona;
  onChange: (persona: Persona) => void;
}) {
  const options: Persona[] = ["Retail Lender", "Institutional Borrower"];
  return (
    <div className="persona-switcher" aria-label="Viewing mode">
      <span>Viewing mode</span>
      {options.map((option) => (
        <button
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          key={option}
        >
          <i aria-hidden="true" />{option === "Institutional Borrower" ? "Institutional MM" : option}
        </button>
      ))}
    </div>
  );
}
