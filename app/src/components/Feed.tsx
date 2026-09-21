import type { LendingEvent, ReplayMeta } from "../lib/source";

const short = (value: string) => `${value.slice(0, 4)}...${value.slice(-4)}`;

function EventRow({ event }: { event: LendingEvent }) {
  const yieldEvent = event.kind === "accrue" || event.kind === "redeem";
  return (
    <article className={`activity-row${yieldEvent ? " activity-yield" : ""}`}>
      <div className="activity-sequence">{String(event.seq).padStart(2, "0")}</div>
      <div className="activity-copy">
        <div className="activity-meta">
          <span>{event.kind}</span>
          <span>slot {event.slot}</span>
          <span>{short(event.actor)}</span>
        </div>
        <p>{event.message}</p>
      </div>
      <code title={event.signature}>{short(event.signature)}</code>
    </article>
  );
}

export function Feed({ meta, events }: { meta: ReplayMeta; events: LendingEvent[] }) {
  return (
    <section className="activity-card" aria-labelledby="activity-title">
      <div className="activity-head">
        <div>
          <div className="eyebrow">Fork activity</div>
          <h2 id="activity-title">The full lending loop.</h2>
        </div>
        <div className="activity-source">
          <span>Recorded replay</span>
          <strong>{meta.market}</strong>
        </div>
      </div>
      <div className="activity-list">
        {events.map((event) => <EventRow event={event} key={event.signature} />)}
      </div>
      <p className="microcopy">{meta.caveats[0]}</p>
    </section>
  );
}
