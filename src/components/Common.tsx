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
        {events.slice(-6).map((e) => (
          <div key={e.id}>
            <span>{TIMELINE_LABELS[e.type]}</span>
            <span>{duration(e.durationSec)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
