import { dateLabel } from "../components/format";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  Plus,
  TrendingUp,
  Sprout,
  BookOpen,
} from "lucide-react";
import { dataService } from "../app/dependencies";
import { useLoad } from "../hooks/ui/useLoad";
import { ErrorNotice, Pending } from "../components/Common";
const load = async () => {
  const [tasks, insights, sessions] = await Promise.all([
    dataService.listTasks(),
    dataService.getInsights(),
    dataService.getRecentSessions(),
  ]);
  return { tasks, insights, sessions: sessions.filter(s => s.endedAtISO && s.reflection && Number.isFinite(s.score)) };
};
export default function Dashboard() {
  const { data, loading, error, reload } = useLoad(load);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reset, setReset] = useState(false);
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError("");
    try {
      await action();
      reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not update your workspace.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await act(async () => {
      await dataService.createTask({
        title: String(values.get("title")),
        subject: String(values.get("subject")),
        estimatedMinutes: Number(values.get("minutes")),
        deadlineISO: new Date(
          `${values.get("deadline")}T12:00:00`,
        ).toISOString(),
      });
      form.reset();
    });
  }
  const tasks = data?.tasks ?? [];
  const remaining = tasks.filter((t) => t.status === "todo");
  return (
    <>
      <div className="eyebrow">
        {new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      </div>
      <div className="page-heading">
        <div>
          <h1>Good morning.</h1>
          <p>Here’s your plan for today. Make room for a little progress.</p>
        </div>
        <span className="soft-badge">
          <span className="dot" /> One session at a time
        </span>
      </div>
      <ErrorNotice message={error || actionError} />
      {loading ? (
        <Pending />
      ) : (
        <>
          <section className="overview">
            <div>
              <span className="eyebrow">A CLEAR PLAN. A CALMER MIND.</span>
              <h2>
                Your next chapter
                <br />
                starts with a little focus.
              </h2>
              <p>
                Plan your work. Notice your patterns.
                <br />
                Find a rhythm that works for you.
              </p>
            </div>
            <div className="overview-stats">
              <div>
                <strong>{remaining.length.toString().padStart(2, "0")}</strong>
                <span>tasks on your plan</span>
              </div>
              <div>
                <strong>
                  {remaining.reduce((n, t) => n + t.estimatedMinutes, 0)}
                  <small> min</small>
                </strong>
                <span>of intentional study</span>
              </div>
            </div>
            <div className="decor-rings" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </section>
          <div className="dashboard-grid">
            <section>
              <div className="section-heading">
                <h2>
                  Today’s plan <span className="count">{tasks.length}</span>
                </h2>
                <span className="muted">Small steps, meaningful progress</span>
              </div>
              {!tasks.length && (
                <div className="panel empty">
                  <BookOpen size={32} />
                  <h3>A fresh page.</h3>
                  <p>
                    Add your first task below, or explore a ready-to-go
                    workspace.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => act(() => dataService.loadDemoWorkspace())}
                  >
                    Load demo workspace <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="task-list">
                {tasks.map((t, i) => (
                  <article className="panel task-card" key={t.id}>
                    <div className={`task-symbol tone-${i % 3}`}>
                      <BookOpen size={22} />
                    </div>
                    <div className="task-info">
                      <span className="eyebrow">{t.subject}</span>
                      <h3>{t.title}</h3>
                      <div className="task-meta">
                        <span>
                          <Clock3 size={13} /> {t.estimatedMinutes} min
                        </span>
                        <span>Due {dateLabel(t.deadlineISO)}</span>
                        {t.status === "done" && (
                          <span className="done">Complete</span>
                        )}
                      </div>
                    </div>
                    <Link
                      className="button secondary compact"
                      to={`/session/${t.id}`}
                    >
                      {t.status === "done" ? "Study again" : "Start Session"}
                      <ArrowRight size={15} />
                    </Link>
                  </article>
                ))}
              </div>
              <section className="panel add-task">
                <h3>
                  <Plus size={18} /> Make a little plan
                </h3>
                <form onSubmit={add}>
                  <div className="form-grid">
                    <label className="wide">
                      Task name
                      <input
                        name="title"
                        placeholder="What would you like to work on?"
                        required
                        maxLength={120}
                      />
                    </label>
                    <label>
                      Subject
                      <input
                        name="subject"
                        placeholder="e.g. Mathematics"
                        required
                        maxLength={60}
                      />
                    </label>
                    <label>
                      Estimated minutes
                      <input
                        name="minutes"
                        type="number"
                        min="1"
                        max="480"
                        defaultValue="30"
                        required
                      />
                    </label>
                    <label>
                      Deadline
                      <input name="deadline" type="date" required />
                    </label>
                    <div className="form-action">
                      <button disabled={busy} type="submit">
                        <Plus size={16} />
                        Add task
                      </button>
                    </div>
                  </div>
                </form>
              </section>
            </section>
            <aside>
              <div className="section-heading">
                <h2>Quick insights</h2>
                <TrendingUp size={19} />
              </div>
              <div className="panel insight-panel">
                <span className="eyebrow">GET TO KNOW YOUR RHYTHM</span>
                {data?.insights.length ? (
                  data.insights.slice(0, 3).map((insight, i) => (
                    <article className="insight" key={insight}>
                      <span>0{i + 1}</span>
                      <p>{insight}</p>
                    </article>
                  ))
                ) : (
                  <p className="muted">
                    Your patterns begin with one session. Study, reflect, and
                    discover what helps you learn.
                  </p>
                )}
              </div>
              <section className="tomorrow-card">
                <Sprout size={27} />
                <h2>
                  A better tomorrow,
                  <br />
                  built from today.
                </h2>
                <p>
                  Your next plan takes shape with every session and reflection.
                </p>
                <Link to="/tomorrow">
                  View adaptive plan <ArrowRight size={17} />
                </Link>
              </section>
              <p className="aside-note">
                {data?.sessions.length ?? 0} completed sessions in your
                workspace
              </p>
            </aside>
          </div>
        </>
      )}
      <div className="reset-area">
        {reset ? (
          <div
            className="reset-confirm"
            role="group"
            aria-label="Confirm reset"
          >
            <span>Delete all tasks and sessions in this local workspace?</span>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await dataService.resetWorkspace();
                  setReset(false);
                })
              }
            >
              Delete local data
            </button>
            <button className="secondary" onClick={() => setReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="text-button" onClick={() => setReset(true)}>
            Reset local data
          </button>
        )}
      </div>
    </>
  );
}
