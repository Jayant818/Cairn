export type FeedRow = {
  key: string;
  seq: number;
  kind: string;
  meta: string[];
  message: string;
  code?: string;
};

const YIELD_KINDS = new Set(["accrue", "redeem", "time"]);
const short = (value: string) => `${value.slice(0, 4)}...${value.slice(-4)}`;

function EventRow({ row }: { row: FeedRow }) {
  return (
    <article className={`activity-row${YIELD_KINDS.has(row.kind) ? " activity-yield" : ""}`}>
      <div className="activity-sequence">{String(row.seq).padStart(2, "0")}</div>
      <div className="activity-copy">
        <div className="activity-meta">
          <span>{row.kind}</span>
          {row.meta.map((item) => <span key={item}>{item}</span>)}
        </div>
        <p>{row.message}</p>
      </div>
      {row.code && <code title={row.code}>{short(row.code)}</code>}
    </article>
  );
}

export function Feed({
  eyebrow,
  title,
  sourceLabel,
  sourceValue,
  rows,
  caveat,
  empty,
}: {
  eyebrow: string;
  title: string;
  sourceLabel: string;
  sourceValue: string;
  rows: FeedRow[];
  caveat?: string;
  empty?: string;
}) {
  return (
    <section className="activity-card" aria-label={title}>
      <div className="activity-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
        <div className="activity-source">
          <span>{sourceLabel}</span>
          <strong>{sourceValue}</strong>
        </div>
      </div>
      <div className="activity-list">
        {rows.length ? rows.map((row) => <EventRow row={row} key={row.key} />) : <p className="activity-empty">{empty}</p>}
      </div>
      {caveat && <p className="microcopy">{caveat}</p>}
    </section>
  );
}
