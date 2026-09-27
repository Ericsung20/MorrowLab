import { CompanionSetup } from "../components/CompanionSetup";
import { HeadPose } from "../components/HeadPose";
import { duration } from "../components/format";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  ShieldCheck,
  Smartphone,
  UserRound,
  Play,
  Square,
} from "lucide-react";
import { dataService, useStudySensors } from "../app/dependencies";
import type {
  ActivitySegment,
  CameraEvent,
  StudySession,
} from "../contracts/morrowlab";
import { useLoad } from "../hooks/ui/useLoad";
import { estimateTaskTime } from "../features/activity/classifyActivity";
import {
  BehaviorTimeline,
  SessionHighlights,
  ErrorNotice,
  Pending,
} from "../components/Common";
const loadTasks = async () =>
  (await dataService.listTasks()).filter((t) => t.status === "todo");
const STATE_LABELS: Record<string, string> = {
  studying: "Studying",
  phone: "On phone",
  away: "Away",
  distracted: "Looking elsewhere",
  talking: "Chatting",
};
export default function Session() {
  const { data: tasks, error, loading } = useLoad(loadTasks);
  const { state, controller, videoRef, isMock } = useStudySensors(tasks);
  const navigate = useNavigate();
  const [session, setSession] = useState<StudySession>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [capture, setCapture] = useState<{
    endedAtISO: string;
    cameraEvents: CameraEvent[];
    activitySegments: ActivitySegment[];
  }>();
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  const [done, setDone] = useState<string[]>([]);
  const [focus, setFocus] = useState(3);
  const [understanding, setUnderstanding] = useState(3);
  const [completion, setCompletion] = useState(75);
  const [note, setNote] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const timerStart = useRef(0);
  const running = state.status === "running";
  useEffect(() => {
    if (!session || capture) return;
    const timer = setInterval(
      () => setElapsed((Date.now() - timerStart.current) / 1000),
      250,
    );
    return () => clearInterval(timer);
  }, [session, capture]);
  useEffect(() => {
    if (!session) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session, capture]);
  async function start() {
    setBusy(true);
    setActionError("");
    try {
      if (!session) {
        const created = await dataService.startSession();
        timerStart.current = Date.now();
        setSession(created);
      }
      // Camera permission/model downloads must not block End session or fallback controls.
      void controller.start().catch(e => setActionError(e instanceof Error ? e.message : 'Camera unavailable. Manual tracking can continue.'));
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "Monitoring could not start. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    setBusy(true);
    setActionError("");
    try {
      const result = await controller.stop();
      const estimate = estimateTaskTime(result.activitySegments, result.cameraEvents, tasks ?? []);
      setMinutes(Object.fromEntries(estimate.map((e) => [e.taskId, Math.round(e.seconds / 60)])));
      setElapsed((Date.now() - timerStart.current) / 1000);
      setCapture({ ...result, endedAtISO: new Date().toISOString() });
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "Could not stop monitoring. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    if (!session || !capture) return;
    setBusy(true);
    setActionError("");
    try {
      const saved = await dataService.finishSession(session.id, {
        ...capture,
        reflection: { focus, understanding, completionPct: completion, note },
        taskBreakdown: Object.entries(minutes).map(([taskId, m]) => ({ taskId, seconds: m * 60 })),
        completedTaskIds: done,
      });
      navigate(`/summary/${saved.id}`, { replace: true });
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "Could not save your reflection. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Pending />;
  if (error)
    return (
      <>
        <ErrorNotice message={error} />
        <Link to="/">Back to dashboard</Link>
      </>
    );
  const plan = tasks ?? [];
  const assignedMinutes = Object.values(minutes).reduce((a, b) => a + b, 0);
  return (
    <>
      <Link
        className="back-link"
        to="/"
        onClick={(e) => {
          if (
            session &&
            !window.confirm(
              "Leave this session? Its unsaved events and reflection will be lost.",
            )
          )
            e.preventDefault();
        }}
      >
        <ArrowLeft size={16} />
        Today’s plan
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {capture ? "A MOMENT TO REFLECT" : "YOUR FOCUS SPACE"}
          </div>
          <h1>Study session</h1>
          <p>
            {capture
              ? "The way it felt matters as much as the time you spent."
              : "Work on anything from your plan. MorrowLab keeps track of what you work on."}
          </p>
        </div>
        <span className="soft-badge">{plan.length} tasks on your plan</span>
      </div>
      <ErrorNotice message={actionError || state.error || ""} />
      {capture ? (
        <section className="panel reflection">
          <SessionHighlights events={capture.cameraEvents} segments={capture.activitySegments} elapsed={elapsed} />
          <span className="eyebrow">SESSION REFLECTION</span>
          <h2>How did it go?</h2>
          <p className="muted">
            A quick check-in helps shape your next study plan.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void finish();
            }}
          >
            {plan.length > 0 && (
              <fieldset className="task-breakdown">
                <legend>What did you work on?</legend>
                <p className="muted">
                  Estimated from your open tabs and camera. Adjust anything that looks off.
                  {" "}Session length: {duration(elapsed)} · assigned: {assignedMinutes} min.
                </p>
                {plan.map((t) => (
                  <div className="breakdown-row" key={t.id}>
                    <span>
                      <strong>{t.title}</strong>
                      <small className="muted"> · {t.subject}</small>
                    </span>
                    <label>
                      <input
                        type="number"
                        min="0"
                        max="1440"
                        aria-label={`Minutes on ${t.title}`}
                        value={minutes[t.id] ?? 0}
                        onChange={(e) => setMinutes({ ...minutes, [t.id]: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      min
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={done.includes(t.id)}
                        onChange={(e) => setDone(e.target.checked ? [...done, t.id] : done.filter((id) => id !== t.id))}
                      />
                      Finished
                    </label>
                  </div>
                ))}
              </fieldset>
            )}
            {[
              {
                label: "How focused did you feel?",
                value: focus,
                set: setFocus,
              },
              {
                label: "How well did you understand the material?",
                value: understanding,
                set: setUnderstanding,
              },
            ].map((item) => (
              <fieldset key={item.label}>
                <legend>{item.label}</legend>
                <div className="rating-options">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n}>
                      <input
                        type="radio"
                        name={item.label}
                        value={n}
                        checked={item.value === n}
                        onChange={() => item.set(n)}
                      />
                      <span>{n}</span>
                    </label>
                  ))}
                </div>
                <div className="scale-labels">
                  <span>Not much</span>
                  <span>Very much</span>
                </div>
              </fieldset>
            ))}
            <label className="slider-label">
              How much of what you planned for this session did you complete?
              <strong>{completion}%</strong>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={completion}
                onChange={(e) => setCompletion(Number(e.target.value))}
              />
            </label>
            <label>
              Optional note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What helped? What might you try next time?"
                maxLength={1500}
              />
            </label>
            <button className="full-width" disabled={busy} type="submit">
              {busy ? "Saving reflection…" : "Finish session"}
            </button>
          </form>
        </section>
      ) : (
        <div className="session-grid">
          <section>
            <div className="camera-frame">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={isMock ? "hidden-video" : "live-video"}
              />
              <div className="camera-top">
                <span className="camera-label">
                  <span className={`dot ${running ? "" : "inactive"}`} />
                  {isMock ? "DEMO CAMERA" : "LOCAL CAMERA"}
                </span>
                <span>{duration(elapsed)}</span>
              </div>
              {isMock && (
                <div className="camera-placeholder">
                  <div className="viewfinder">
                    <Camera size={44} strokeWidth={1} />
                  </div>
                  <h2>Your focus starts here.</h2>
                </div>
              )}
              <div className="camera-mascot">
                <HeadPose pose={running ? state.headPose ?? null : null} />
              </div>
              <div className="camera-bottom">
                <div>
                  <span className="eyebrow">CURRENT STATE</span>
                  <strong>
                    {running
                      ? state.screenDistracted
                        ? "Screen distraction"
                        : state.currentState === "studying" && !isMock && state.activitySegments.at(-1)?.category === "neutral" ? "Facing screen · activity unknown"
                        : state.currentState ? STATE_LABELS[state.currentState] : "Calibrating — look at your screen"
                      : state.status === "loading"
                        ? session ? "Connecting camera…" : "Loading…"
                        : state.status === 'error' ? 'Camera unavailable · manual tracking active' : "Ready when you are"}
                  </strong>
                </div>
                <div className="camera-companion">
                  {running && state.confidence !== undefined && (
                    <span className="confidence">
                      {Math.round(state.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="privacy">
              <ShieldCheck size={16} />
              Video stays on this device. Only study events are saved. Looking down at paper or a tablet counts as studying.
            </p>
            <div className="session-controls">
              <button
                onClick={start}
                disabled={busy || !!session}
              >
                <Play size={16} />
                {busy && !session
                  ? "Starting…"
                  : session
                    ? "Monitoring active"
                    : "Start monitoring"}
              </button>
              <button
                className="secondary"
                onClick={end}
                disabled={busy || !session}
              >
                <Square size={14} />
                End session
              </button>
            </div>
            <div className="fallback">
              <div>
                <span className="eyebrow">DEMO FALLBACK</span>
                <p>Try a short event to explore the timeline.</p>
              </div>
              <button
                className="secondary compact"
                disabled={!session || busy}
                onClick={() => controller.simulatePhone()}
              >
                <Smartphone size={15} />
                Simulate phone
              </button>
              <button
                className="secondary compact"
                disabled={!session || busy}
                onClick={() => controller.simulateAway()}
              >
                <UserRound size={15} />
                Simulate away
              </button>
            </div>
          </section>
          <aside className="panel telemetry">
            <div className="section-heading">
              <h2>Session telemetry</h2>
              <span className="dot" />
            </div>
            <div className="timer">
              {duration(elapsed)}
              <span>elapsed time</span>
            </div>
            <div className="mini-metrics">
              <div>
                <strong>{duration(state.studySeconds)}</strong>
                <span>Study time</span>
              </div>
              <div>
                <strong>{state.phoneEventCount}</strong>
                <span>Phone events</span>
              </div>
              <div>
                <strong>{state.awayEventCount}</strong>
                <span>Away events</span>
              </div>
              <div>
                <strong>{state.offTaskEventCount}</strong>
                <span>Off-task events</span>
              </div>
            </div>
            <h3>Event timeline</h3>
            <BehaviorTimeline events={state.cameraEvents} segments={state.activitySegments} />
            {!isMock && <CompanionSetup />}
          </aside>
        </div>
      )}
    </>
  );
}
