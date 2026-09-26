import { dateLabel } from "../components/format";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock3, Sprout } from "lucide-react";
import { dataService } from "../app/dependencies";
import { useLoad } from "../hooks/ui/useLoad";
import { ErrorNotice, Pending } from "../components/Common";
const load = async () => {
  const [recommendations, sessions] = await Promise.all([
    dataService.getTomorrowRecommendations(),
    dataService.getRecentSessions(),
  ]);
  return { recommendations, sessions };
};
function timeLabel(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}
export default function Tomorrow() {
  const { data, error, loading } = useLoad(load);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    <>
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Today’s plan
      </Link>
      <div className="eyebrow">
        {dateLabel(data?.recommendations[0]?.dateISO ?? tomorrow.toISOString())}{" "}
        · YOUR NEXT CHAPTER
      </div>
      <div className="page-heading">
        <div>
          <h1>A more intentional tomorrow.</h1>
          <p>A study plan that makes room for the way you learn.</p>
        </div>
        <span className="soft-badge">
          <Sprout size={16} />
          Plan · Observe · Adapt
        </span>
      </div>
      <ErrorNotice message={error} />
      {loading ? (
        <Pending />
      ) : (
        data && (
          <div className="tomorrow-grid">
            <section>
              <div className="section-heading">
                <h2>Your adaptive schedule</h2>
                <span className="muted">
                  {data.recommendations.length} study blocks
                </span>
              </div>
              {data.recommendations.length ? (
                <ol className="schedule">
                  {data.recommendations.map((r, i) => (
                    <li key={r.taskId}>
                      <div className="schedule-time">
                        {timeLabel(r.startTime)}
                        <span className="schedule-dot" />
                      </div>
                      <article className="panel schedule-card">
                        <span className="eyebrow">
                          BLOCK {String(i + 1).padStart(2, "0")} · {r.subject}
                        </span>
                        <h2>{r.taskTitle}</h2>
                        <span className="task-meta">
                          <Clock3 size={14} />
                          {r.estimatedMinutes} min · {dateLabel(r.dateISO)}
                        </span>
                        <div className="schedule-reasons">
                          <span className="eyebrow">
                            WHY THIS WORKS FOR YOU
                          </span>
                          {r.reasons.map((reason) => (
                            <p key={reason}>{reason}</p>
                          ))}
                        </div>
                      </article>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="panel empty">
                  <Sprout size={32} />
                  <h2>Room for a new plan.</h2>
                  <p>
                    Add an unfinished task to see tomorrow’s suggested study
                    blocks.
                  </p>
                  <Link className="button" to="/">
                    Plan a task
                    <ArrowRight size={16} />
                  </Link>
                </div>
              )}
            </section>
            <aside>
              <section className="panel detail-panel">
                <Sprout className="green" size={28} />
                <h2>Learning your rhythm.</h2>
                <p className="muted">
                  Your plan is a starting point. Leave room to pause, reflect,
                  and adjust.
                </p>
                <hr />
                <p>
                  <strong>
                    Based on {data.sessions.length} recent sessions
                  </strong>
                </p>
                {data.sessions.some((s) => s.isDemoHistory) && (
                  <span className="soft-badge">Includes demo history</span>
                )}
                {data.sessions.some((s) => !s.isDemoHistory) && (
                  <p className="green">Updated from your latest session</p>
                )}
              </section>
              <p className="aside-note">
                A thoughtful plan leaves space for life, too.
              </p>
            </aside>
          </div>
        )
      )}
    </>
  );
}
