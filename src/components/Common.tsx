import { Link } from "react-router-dom";
import type { ActivitySegment, CameraEvent } from "../contracts/morrowlab";
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
export function BehaviorTimeline({ events }: { events: CameraEvent[] }) {
  return (
    <>
      <div className="behavior-track" aria-label="Behavior timeline">
        {events.map((e) => (
          <span
            key={e.id}
            className={e.type}
            style={{ flexGrow: Math.max(e.durationSec, 0.5) }}
            title={`${e.type}: ${duration(e.durationSec)}`}
          />
        ))}
      </div>
      <div className="legend">
        <span>
          <i className="studying" />
          Studying
        </span>
        <span>
          <i className="phone" />
          Phone
        </span>
        <span>
          <i className="away" />
          Away
        </span>
      </div>
      {!events.length && (
        <p className="muted">Events will appear when monitoring starts.</p>
      )}
      <div className="event-list">
        {events.slice(-6).map((e) => (
          <div key={e.id}>
            <span className="capitalize">{e.type}</span>
            <span>{duration(e.durationSec)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
export function ActivityList({ segments }: { segments: ActivitySegment[] }) {
  return (
    <div className="event-list">
      {segments.length ? (
        segments.map((s) => (
          <div key={s.id}>
            <span>{s.label}</span>
            <span>{duration(s.durationSec)}</span>
          </div>
        ))
      ) : (
        <p className="muted">No activity recorded yet.</p>
      )}
    </div>
  );
}
