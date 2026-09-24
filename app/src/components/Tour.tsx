import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { markTourDone } from "../lib/tourStore";

const STEPS = [
  {
    target: "intro",
    title: "What Cairn does",
    body: "Cairn lets you lend tokenized stock (SPYx) to market makers. They pay interest, and you earn it through a receipt token called cSPYx.",
  },
  {
    target: "wallet",
    title: "Your paper wallet",
    body: "This is play money: 25 SPYx and 10,000 USDC. It updates after every action, so you can watch each step land.",
  },
  {
    target: "guide",
    title: "One button per step",
    body: "Follow the big button: lend, skip 30 days, and withdraw. It takes about a minute and shows your profit at the end.",
  },
  {
    target: "stats",
    title: "The market in numbers",
    body: "These numbers come from the same math as the on-chain program. Each one has a plain-English line under it.",
  },
] as const;

type Box = { top: number; left: number; width: number; height: number };

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[index];

  const measure = useCallback(() => {
    const element = document.querySelector(`[data-tour="${step.target}"]`);
    if (!element) return setBox(null);
    const rect = element.getBoundingClientRect();
    setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, [step.target]);

  const finish = useCallback(() => {
    markTourDone();
    setIndex(0);
    onClose();
  }, [onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    document.querySelector(`[data-tour="${step.target}"]`)?.scrollIntoView({ block: "center", behavior: "instant" });
    // Measuring the DOM is the external system here.
    // oxlint-disable-next-line react/set-state-in-effect
    measure();
    nextRef.current?.focus();
  }, [open, step.target, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("keydown", onKey);
    };
  });

  if (!open) return null;
  const last = index === STEPS.length - 1;
  const pad = 8;
  // Place the card below the target, else above it, else pin it to the bottom of the screen
  // (a target taller than the viewport, like the hero on a phone, leaves no room on either side).
  const CARD = 230;
  const spaceBelow = box ? window.innerHeight - (box.top + box.height + pad) : 0;
  const spaceAbove = box ? box.top - pad : 0;
  const place = !box ? "pinned" : spaceBelow >= CARD ? "below" : spaceAbove >= CARD ? "above" : "pinned";
  const cardStyle = place === "below"
    ? { top: box!.top + box!.height + pad + 8 }
    : place === "above"
      ? { top: box!.top - pad - 8 }
      : { bottom: 16 };
  const left = box && place !== "pinned" ? Math.min(Math.max(12, box.left), window.innerWidth - 352) : Math.max(12, (window.innerWidth - 340) / 2);

  return (
    <div className="tour-layer">
      {box && (
        <div
          className="tour-ring"
          style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
        />
      )}
      <div
        className={`tour-card${place === "above" ? " tour-card-above" : ""}`}
        role="dialog"
        aria-labelledby="tour-title"
        style={{ ...cardStyle, left }}
      >
        <div className="tour-count">{index + 1} / {STEPS.length}</div>
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="text-button" onClick={finish}>Skip tour</button>
          <span>
            {index > 0 && <button type="button" className="tour-back" onClick={() => setIndex(index - 1)}>Back</button>}
            <button type="button" className="tour-next" ref={nextRef} onClick={() => (last ? finish() : setIndex(index + 1))}>
              {last ? "Start" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
