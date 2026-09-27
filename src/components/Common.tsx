import { Link } from "react-router-dom";
import type { ActivitySegment, CameraEvent } from "../contracts/morrowlab";
import { withScreenDistraction } from "../features/sensors/useStudySensors";
import { duration } from "./format";
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
export function Pending() {
  return (
    <div className="panel empty" role="status">
      Getting your workspace ready…
    </div>
  );
}
export function Missing({ title }: { title: string }) {
  return (
    <div className="panel empty">
      <h1>{title}</h1>
      <p>It may have been removed from this workspace.</p>
      <Link className="button" to="/">
        Back to dashboard
      </Link>
    </div>
  );
}
const TIMELINE_LABELS: Record<string, string> = {
  studying: "Studying",
  phone: "Phone",
  away: "Away",
  distracted: "Looking elsewhere",
  talking: "Chatting",
  screen: "Screen distraction",
};
/** Camera states, with time on distracting sites/apps shown as "Screen distraction". */
export function BehaviorTimeline({ events: cameraEvents, segments = [] }: { events: CameraEvent[]; segments?: ActivitySegment[] }) {
  const events = withScreenDistraction(cameraEvents, segments);
  const totals = timelineTotals(events);
  return (
    <>
      <div className="behavior-track" aria-label="Behavior timeline">
        {events.map((e) => (
          <span
            key={e.id}
            className={e.type}
            style={{ flexGrow: Math.max(e.durationSec, 0.5) }}
            title={`${TIMELINE_LABELS[e.type]}: ${duration(e.durationSec)}`}
          />
        ))}
      </div>
      <div className="legend">
        {Object.entries(TIMELINE_LABELS).map(([type, label]) => (
          <span key={type}>
            <i className={type} />
            {label}
          </span>
        ))}
      </div>
      {!events.length && (
        <p className="muted">Events will appear when monitoring starts.</p>
      )}
      <div className="event-list">
        {totals.map((e) => (
          <div key={e.type}>
            <span>{TIMELINE_LABELS[e.type]}</span>
            <span>{duration(e.durationSec)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function timelineTotals(events: ReturnType<typeof withScreenDistraction>) {
  const totals = new Map<string, number>();
  for (const event of events) totals.set(event.type, (totals.get(event.type) ?? 0) + event.durationSec);
  return [...totals].map(([type, durationSec]) => ({ type, durationSec }))
    .sort((a, b) => b.durationSec - a.durationSec || a.type.localeCompare(b.type));
}

export function SessionHighlights({ events, segments, elapsed }: { events: CameraEvent[]; segments: ActivitySegment[]; elapsed: number }) {
  const timeline = withScreenDistraction(events, segments);
  const study = timeline.filter(e => e.type === 'studying').reduce((sum, e) => sum + e.durationSec, 0);
  const distracted = timeline.filter(e => e.type !== 'studying').reduce((sum, e) => sum + e.durationSec, 0);
  const longest = Math.max(0, ...timeline.filter(e => e.type === 'studying').map(e => e.durationSec));
  const untracked = Math.max(0, elapsed - study - distracted);
  return <section className="session-highlights" aria-label="Study session highlights">
    <div className="eyebrow">SESSION HIGHLIGHTS</div>
    <h2>Your time, at a glance.</h2>
    <div className="highlight-times">
      <div className="highlight-study"><span>Total study time</span><strong>{duration(study)}</strong></div>
      <div className="highlight-distracted"><span>Distracted time</span><strong>{duration(distracted)}</strong></div>
    </div>
    <p>Longest study streak <strong>{duration(longest)}</strong> · Session length <strong>{duration(elapsed)}</strong></p>
    <small>Distracted time includes phone, away, looking elsewhere, chatting, and screen distraction.
      {untracked >= 1 && ` Untracked: ${duration(untracked)} (waiting for tracking).`}</small>
  </section>;
}
