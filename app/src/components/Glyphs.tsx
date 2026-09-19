/** Three hand-authored glyphs, one per card. ⛔ NOT decoration and NOT a stock icon set:
 *  each one draws the mechanic its card names, so a reader who skips the sentence still
 *  gets it. Stroke only, currentColor, so they inherit the card's colour and cost nothing
 *  to retheme — an <img> would be a network round trip and a second source of truth for
 *  the palette.
 *  ⛔ v1 gave the first and third the SAME rounded rect and they were indistinguishable at
 *  48px. Each now has its own silhouette: an open vessel, a staircase, a circle. */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2,
            strokeLinecap: "round", strokeLinejoin: "round" } as const;

const Svg = (p: { children: React.ReactNode }) => (
  <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">{p.children}</svg>
);

/** value drops into an open vessel; a thick floor is what stayed behind */
export function GlyphFee() {
  return (
    <Svg>
      <path d="M28 4v16M21 14l7 7 7-7" {...S} />
      <path d="M10 26v16a6 6 0 0 0 6 6h24a6 6 0 0 0 6-6V26" {...S} />
      <path d="M13 41h30" {...S} strokeWidth={5} strokeLinecap="butt" />
    </Svg>
  );
}

/** a floor that only ever steps up; the dashed rule is where it started */
export function GlyphRatchet() {
  return (
    <Svg>
      <path d="M6 48h9V37h9V26h9V15h9V6h8" {...S} />
      <path d="M6 52h44" {...S} strokeWidth={1.5} strokeDasharray="2 4" opacity={0.5} />
    </Svg>
  );
}

/** both legs leave together, or one does; the share burns whole either way */
export function GlyphInKind() {
  return (
    <Svg>
      <circle cx="28" cy="35" r="13" {...S} />
      <path d="M18 26 8 16M8 23V16h7" {...S} />
      <path d="M38 26 48 16M48 23V16h-7" {...S} strokeDasharray="3 3" />
      <path d="M21 32h14M21 39h14" {...S} strokeWidth={1.5} opacity={0.55} />
    </Svg>
  );
}
