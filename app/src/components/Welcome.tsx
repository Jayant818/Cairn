import { type CSSProperties, useEffect, useRef, useState } from "react";

const SLIDES = [
  {
    id: "welcome",
    title: "Welcome to Cairn",
    body: "The LST layer for tokenized equities. Lend SPYx and keep a liquid receipt while market makers borrow it.",
    note: "This is paper trading: no wallet, no real funds.",
    visual: ["SPYx", "Cairn", "Market makers"],
  },
  {
    id: "earn",
    title: "What you hold",
    body: "cSPYx is your SPYx in receipt form: transferable, usable as collateral, and redeemable from idle cash with no 3-day unwind. Borrowers pay interest into the pool, so each cSPYx is worth more SPYx over time.",
    note: "The yield depends on borrow demand. The page shows the formula.",
    visual: ["Lend SPYx", "Hold cSPYx", "Withdraw more SPYx"],
  },
  {
    id: "try",
    title: "Try it in a minute",
    body: "Follow the highlighted button: lend 5 SPYx, skip 30 days, and withdraw. You will see your profit in SPYx.",
    note: "Your paper wallet in the navbar shows every change.",
    visual: ["1 Lend", "2 Skip 30 days", "3 Withdraw"],
  },
] as const;

// A short first-visit welcome: a few calm slides with Skip, Back and Next.
// It hands off to the coach mark on the first guided action when it closes.
export function Welcome({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && !last) setIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, last, onClose]);

  if (!open) return null;
  const close = () => { setIndex(0); onClose(); };

  return (
    <div className="welcome-scrim">
      <section className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className="welcome-stagger" key={slide.id}>
          <ol className="welcome-flow" aria-hidden="true" style={{ "--i": 0 } as CSSProperties}>
            {slide.visual.map((item, position) => (
              <li key={item}>{item}{position < slide.visual.length - 1 && <span>→</span>}</li>
            ))}
          </ol>
          <h2 id="welcome-title" style={{ "--i": 1 } as CSSProperties}>{slide.title}</h2>
          <p style={{ "--i": 2 } as CSSProperties}>{slide.body}</p>
          <small style={{ "--i": 3 } as CSSProperties}>{slide.note}</small>
        </div>
        <div className="welcome-dots" aria-label={`Slide ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((item, position) => <span key={item.id} className={position === index ? "welcome-dot-on" : ""} />)}
        </div>
        <div className="welcome-actions">
          <button type="button" className="text-button" onClick={close}>Skip</button>
          <span>
            {index > 0 && <button type="button" className="welcome-back" onClick={() => setIndex(index - 1)}>Back</button>}
            <button type="button" className="welcome-next" ref={primaryRef} onClick={() => (last ? close() : setIndex(index + 1))}>
              {last ? "Show me" : "Next"}
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}
