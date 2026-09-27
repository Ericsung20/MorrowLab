import { duration } from "../components/format";
import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { dataService, isDemoAdapter } from "../app/dependencies";
import { useLoad } from "../hooks/ui/useLoad";
import {
  BehaviorTimeline,
  ErrorNotice,
  Missing,
  Pending,
} from "../components/Common";
export default function Summary() {
  const { sessionId } = useParams();
  const loader = useCallback(async () => {
    const [session, insights] = await Promise.all([
      dataService.getSession(sessionId ?? ""),
      dataService.getInsights(),
    ]);
    return { session, insights };
  }, [sessionId]);
  const { data, error, loading } = useLoad(loader);
  if (loading) return <Pending />;
  if (error)
    return (
      <>
        <ErrorNotice message={error} />
        <Link to="/">Back to dashboard</Link>
      </>
    );
  const session = data?.session;
  if (!session) return <Missing title="Session not found" />;
  if (!session.endedAtISO)
    return <Missing title="This session hasn’t been completed" />;
  return (
    <>
      <div className="eyebrow">
        <Check size={14} /> SESSION COMPLETE
      </div>
      <div className="page-heading">
        <div>
          <h1>Progress, worth noticing.</h1>
          <p>
            {session.taskBreakdown.length
              ? session.taskBreakdown.map((t) => `${t.taskTitle} (${Math.round(t.seconds / 60)} min)`).join(" · ")
              : session.subject}
          </p>
        </div>
        <Link className="button" to="/tomorrow">
          See tomorrow’s plan
          <ArrowRight size={17} />
        </Link>
      </div>
      <section className="score-panel">
        <div className="score-circle">
          <strong>{session.score ?? "—"}</strong>
          <span>SESSION SCORE</span>
        </div>
        <div>
          <span className="eyebrow">YOU SHOWED UP FOR YOURSELF.</span>
          <h2>
            A little reflection.
            <br />A clearer path forward.
          </h2>
          <p>
            You completed {session.reflection?.completionPct ?? 0}% of your
            goal.
            <br />
            Your reflection is saved for your next plan.
          </p>
          {isDemoAdapter && (
            <small>
              Illustrative demo score
            </small>
          )}
        </div>
      </section>
      <div className="summary-metrics">
        {[
          ["Duration", duration(session.durationSec)],
          ["Focus", `${session.reflection?.focus ?? "—"} / 5`],
          ["Understanding", `${session.reflection?.understanding ?? "—"} / 5`],
          ["Completion", `${session.reflection?.completionPct ?? 0}%`],
          [
            "Phone events",
            session.cameraEvents.filter((e) => e.type === "phone").length,
          ],
          [
            "Away events",
            session.cameraEvents.filter((e) => e.type === "away").length,
          ],
          [
            "Off-task events",
            session.cameraEvents.filter((e) => e.type === "distracted" || e.type === "talking").length,
          ],
          // The full screen activity log stays in local storage; only the distracting total is shown.
          [
            "Screen distraction",
            duration(session.activitySegments.filter((s) => s.category === "distraction").reduce((sum, s) => sum + s.durationSec, 0)),
          ],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="equal-grid">
        <section className="panel detail-panel">
          <h2>Your study rhythm</h2>
          <BehaviorTimeline events={session.cameraEvents} />
        </section>
        <section className="panel detail-panel">
          <h2>What to take forward</h2>
          {data?.insights.map((text) => (
            <p className="summary-insight" key={text}>
              {text}
            </p>
          ))}
          {!data?.insights.length && (
            <p className="muted">
              Keep reflecting to discover your study patterns.
            </p>
          )}
          {session.reflection?.note && (
            <blockquote>
              <span className="eyebrow">YOUR REFLECTION</span>
              <p>{session.reflection.note}</p>
            </blockquote>
          )}
        </section>
      </div>
      <Link className="button secondary" to="/">
        Back to dashboard
      </Link>
    </>
  );
}
