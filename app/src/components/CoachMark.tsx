import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";

const GAP = 12;
const MARGIN = 8;

type Place = "above" | "below";
type Anchor = { left: number; top: number; caretLeft: number; place: Place };

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// A small NON-MODAL popover pinned to the next action, with a caret pointing at it.
// It grows out of its target and never blocks the page. A click on the target
// dismisses it without preventDefault, so that one click both closes the hint and
// runs the action. Clicks elsewhere (scrolling, the navbar) leave it in place,
// because the hint is only done when the user has taken the step or said "Got it".
export function CoachMark({
  target,
  title,
  body,
  onDismiss,
}: {
  target: string;
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  // Measure before paint so the card never flashes in the wrong place.
  useLayoutEffect(() => {
    const place = () => {
      const element = document.querySelector(target);
      const card = cardRef.current;
      if (!element || !card) return;
      const t = element.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      // Only point at a target the user can see. Scrolled away, the hint waits.
      if (t.bottom < 0 || t.top > height) { setAnchor(null); return; }
      const center = t.left + t.width / 2;
      const left = Math.max(MARGIN, Math.min(center - c.width / 2, width - MARGIN - c.width));
      const caretLeft = Math.max(16, Math.min(center - left, c.width - 16));
      let where: Place = "above";
      let top = t.top - c.height - GAP;
      // The sticky header covers the top of the viewport; flip below if the card would sit under it.
      const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
      if (top < header + MARGIN) { where = "below"; top = t.bottom + GAP; }
      top = Math.max(MARGIN, Math.min(top, height - MARGIN - c.height));
      setAnchor({ left, top, caretLeft, place: where });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [target]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onDismiss(); };
    const onDown = (event: Event) => {
      if (document.querySelector(target)?.contains(event.target as Node)) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [onDismiss, target]);

  // One soft ping on the target, so the eye lands on the action the hint names.
  useEffect(() => {
    if (reducedMotion() || typeof Element.prototype.animate !== "function") return;
    try {
      const element = document.querySelector(target);
      (element?.firstElementChild ?? element)?.animate(
        [
          { boxShadow: "0 0 0 0 #f0ecdf99" },
          { boxShadow: "0 0 0 12px #f0ecdf00" },
        ],
        { duration: 900, iterations: 2, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
    } catch {
      // No Web Animations API: the hint still shows.
    }
  }, [target]);

  const placed = anchor !== null;
  const caret: CSSProperties = { left: placed ? anchor.caretLeft - 6 : 0 };
  if (anchor?.place === "below") caret.top = -7;
  else caret.bottom = -7;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={title}
      className={`coach ${reducedMotion() ? "coach-fade" : "coach-grow"} coach-${anchor?.place ?? "above"}`}
      style={{
        left: placed ? anchor.left : -9999,
        top: placed ? anchor.top : -9999,
        transformOrigin: placed ? `${anchor.caretLeft}px ${anchor.place === "above" ? "100%" : "0%"}` : undefined,
        visibility: placed ? "visible" : "hidden",
      }}
    >
      <strong>{title}</strong>
      <p>{body}</p>
      <div className="coach-actions">
        <button type="button" onClick={onDismiss}>Got it</button>
      </div>
      <span aria-hidden="true" className="coach-caret" style={caret} />
    </div>
  );
}
