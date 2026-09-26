import { duration } from "../components/format";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import {
  ActivityList,
  BehaviorTimeline,
  ErrorNotice,
  Missing,
  Pending,
} from "../components/Common";
export default function Session() {
  const { taskId } = useParams();
  return <SessionWorkspace key={taskId} taskId={taskId ?? ""} />;
}
function SessionWorkspace({ taskId }: { taskId: string }) {
  const loader = useCallback(() => dataService.getTask(taskId), [taskId]);
  const { data: task, error, loading } = useLoad(loader);
  const { state, controller, videoRef, isMock } = useStudySensors();
  const navigate = useNavigate();
  const [session, setSession] = useState<StudySession>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [capture, setCapture] = useState<{
    cameraEvents: CameraEvent[];
    activitySegments: ActivitySegment[];
  }>();
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
    if (!session || capture) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session, capture]);
  async function start() {
    setBusy(true);
    setActionError("");
    try {
      if (!session) {
        const created = await dataService.startSession(taskId);
        timerStart.current = Date.now();
        setSession(created);
      }
      await controller.start();
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
      setCapture(await controller.stop());
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
  if (!task) return <Missing title="Task not found" />;
  return (
    <>
      <Link
        className="back-link"
        to="/"
        onClick={(e) => {
          if (
            session &&
            !capture &&
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
            {capture ? "A MOMENT TO REFLECT" : "YOUR FOCUS SPACE"} ·{" "}
            {task.subject}
          </div>
          <h1>{task.title}</h1>
          <p>
            {capture
              ? "The way it felt matters as much as the time you spent."
              : "Settle in. One task, one focused moment at a time."}
          </p>
        </div>
        <span className="soft-badge">{task.estimatedMinutes} min planned</span>
      </div>
      <ErrorNotice message={actionError || state.error || ""} />
      {capture ? (
        <section className="panel reflection">
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
              How much of your goal did you complete?
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
                  <h2>
                    {running
                      ? "A little space to focus."
                      : "Your focus starts here."}
                  </h2>
                  <p>
                    {running
                      ? "Demo monitoring is running."
                      : "Start monitoring when you’re ready."}
                    <br />
                    This demo doesn’t access your camera.
                  </p>
                </div>
              )}
              <div className="camera-bottom">
                <div>
                  <span className="eyebrow">CURRENT STATE</span>
                  <strong className="capitalize">
                    {running
                      ? (state.currentState ?? "Studying")
                      : state.status === "loading"
                        ? "Loading…"
                        : "Ready when you are"}
                  </strong>
                </div>
                {running && state.confidence !== undefined && (
                  <span className="confidence">
                    {Math.round(state.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>
            <p className="privacy">
              <ShieldCheck size={16} />
              Video stays on this device. Only study events are saved.
            </p>
            <div className="session-controls">
              <button
                onClick={start}
                disabled={busy || running || state.status === "loading"}
              >
                <Play size={16} />
                {busy && !session
                  ? "Starting…"
                  : running
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
                disabled={!running || busy}
                onClick={() => controller.simulatePhone()}
              >
                <Smartphone size={15} />
                Simulate phone
              </button>
              <button
                className="secondary compact"
                disabled={!running || busy}
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
            </div>
            <h3>Event timeline</h3>
            <BehaviorTimeline events={state.cameraEvents} />
            <h3>Activity timeline</h3>
            <ActivityList segments={state.activitySegments} />
          </aside>
        </div>
      )}
    </>
  );
}
