import type { HeadTracking } from '../../contracts/faceTracking';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ActivitySegment, CameraEvent, CameraEventType, StudyTask } from '../../contracts/morrowlab';
import { BrowserActivityProvider, DemoActivityProvider } from '../activity/activityProvider';
import type { ActivityProvider } from '../activity/activityProvider';
import { CameraEngine } from '../camera/cameraEngine';
import { REQUIRED_SAMPLES, type ModelStatus } from '../camera/cameraTypes';
import { EventSmoother } from '../camera/eventSmoother';

export interface SensorResult { cameraEvents: CameraEvent[]; activitySegments: ActivitySegment[] }
/** tasks: used to match open tabs to tasks (read when monitoring starts). */
export interface StudySensorOptions { demoActivity?: boolean; tasks?: StudyTask[] }
type Status = 'idle' | 'loading' | 'running' | 'error';
interface Snapshot extends SensorResult {
  status: Status;
  modelStatus: ModelStatus;
  currentState: CameraEventType | null;
  confidence: number;
  elapsedSeconds: number;
  studySeconds: number;
  phoneEventCount: number;
  awayEventCount: number;
  offTaskEventCount: number;
  extensionConnected: boolean;
  companionConnected: boolean;
  /** The screen in front right now is a distracting site/app (per the extension/companion). */
  screenDistracted: boolean;
  error: string | null;
  /** Live head angle (degrees) relative to the calibrated screen pose, for display/tuning. */
  headPose: HeadTracking | null;
}
const initial: Snapshot = { headPose: null, status: 'idle', modelStatus: 'idle', currentState: null, confidence: 0, elapsedSeconds: 0, studySeconds: 0, phoneEventCount: 0, awayEventCount: 0, offTaskEventCount: 0, extensionConnected: false, companionConnected: false, screenDistracted: false, cameraEvents: [], activitySegments: [], error: null };

export type TimelineEvent = Omit<CameraEvent, 'type'> & { type: CameraEventType | 'screen' };
/** Partition observed time once, with playlist study taking priority over camera and screen states. */
export function withScreenDistraction(events: CameraEvent[], segments: ActivitySegment[]): TimelineEvent[] {
  const overrides = segments.filter(s => s.studyOverride);
  const boundaries = [...new Set([...events, ...segments].flatMap(e => [Date.parse(e.startISO), Date.parse(e.endISO)]))]
    .filter(Number.isFinite).sort((a, b) => a - b);
  const result: TimelineEvent[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i], to = boundaries[i + 1];
    const covers = (e: CameraEvent | ActivitySegment) => Date.parse(e.startISO) <= from && Date.parse(e.endISO) >= to;
    const camera = events.find(covers);
    const playlist = overrides.find(covers);
    if (!camera && !playlist) continue;
    const type = playlist ? 'studying' : camera!.type === 'studying' && segments.some(s => s.category === 'distraction' && covers(s)) ? 'screen' : camera!.type;
    const previous = result.at(-1);
    if (previous?.type === type && Date.parse(previous.endISO) === from) {
      previous.endISO = new Date(to).toISOString();
      previous.durationSec += (to - from) / 1000;
    } else {
      result.push({ id: `timeline-${from}`, type, startISO: new Date(from).toISOString(), endISO: new Date(to).toISOString(), durationSec: (to - from) / 1000, confidence: camera?.confidence ?? 1, source: camera?.source ?? 'model' });
    }
  }
  return result;
}
export const studySecondsOnTask = (events: CameraEvent[], segments: ActivitySegment[]) =>
  withScreenDistraction(events, segments).filter(e => e.type === 'studying').reduce((sum, e) => sum + e.durationSec, 0);

export function useStudySensors(videoRef: RefObject<HTMLVideoElement | null>, options: StudySensorOptions = {}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const runtime = useRef<{
    running: boolean; started: number; ended: number; status: Status; modelStatus: ModelStatus; error: string | null;
    events: CameraEvent[]; smoother: EventSmoother; provider: ActivityProvider | null; engine: CameraEngine | null;
    timer: ReturnType<typeof setInterval> | null; manual: CameraEvent | null; pose: HeadTracking | null;
  }>({ running: false, started: 0, ended: 0, status: 'idle', modelStatus: 'idle', error: null, events: [], smoother: new EventSmoother(REQUIRED_SAMPLES), provider: null, engine: null, timer: null, manual: null, pose: null });
  const mounted = useRef(true);
  const tasks = useRef(options.tasks);
  useEffect(() => { tasks.current = options.tasks; }, [options.tasks]);

  const finishManual = useCallback((now: number) => {
    const r = runtime.current;
    if (!r.manual) return;
    const end = Math.min(now, Date.parse(r.manual.endISO));
    const durationSec = (end - Date.parse(r.manual.startISO)) / 1000;
    if (durationSec > 0) r.events.push({ ...r.manual, endISO: new Date(end).toISOString(), durationSec });
    r.manual = null;
  }, []);

  const publish = useCallback(() => {
    if (!mounted.current) return;
    const r = runtime.current;
    const now = r.running ? Date.now() : r.ended;
    if (r.manual && now >= Date.parse(r.manual.endISO)) finishManual(now);
    const active = r.manual ? { ...r.manual, endISO: new Date(now).toISOString(), durationSec: Math.max(0, (now - Date.parse(r.manual.startISO)) / 1000) } : r.smoother.snapshot(now);
    const events = [...r.events, ...(active ? [active] : [])];
    const segments = r.provider?.getSegments() ?? [];
    const studySeconds = studySecondsOnTask(events, segments);
    setSnapshot({ screenDistracted: r.running && !segments.at(-1)?.studyOverride && segments.at(-1)?.category === 'distraction', headPose: r.running ? r.pose : null, status: r.status, modelStatus: r.modelStatus, error: r.error, currentState: r.running ? (segments.at(-1)?.studyOverride ? 'studying' : r.manual?.type ?? r.smoother.currentState) : null, confidence: r.running ? (r.manual?.confidence ?? r.smoother.confidence) : 0, elapsedSeconds: r.started ? Math.floor((now - r.started) / 1000) : 0, studySeconds, phoneEventCount: events.filter(e => e.type === 'phone').length, awayEventCount: events.filter(e => e.type === 'away').length, offTaskEventCount: events.filter(e => e.type === 'distracted' || e.type === 'talking').length, extensionConnected: !!r.provider?.extensionConnected, companionConnected: !!r.provider?.companionConnected, cameraEvents: events, activitySegments: segments });
  }, [finishManual]);

  const stop = useCallback((): SensorResult => {
    const r = runtime.current;
    if (r.running) {
      r.ended = Date.now();
      r.running = false;
      r.engine?.stop();
      r.engine = null;
      if (r.timer !== null) clearInterval(r.timer);
      r.timer = null;
      finishManual(r.ended);
      r.events.push(...r.smoother.flush(r.ended));
      r.provider?.stop();
      r.status = 'idle';
      r.modelStatus = 'idle';
      publish();
    }
    return { cameraEvents: r.events.map(e => ({ ...e })), activitySegments: r.provider?.getSegments() ?? [] };
  }, [finishManual, publish]);

  const start = useCallback(async () => {
    const r = runtime.current;
    if (r.running || !mounted.current) return;
    r.running = true;
    r.started = Date.now();
    r.ended = 0;
    r.status = 'loading';
    r.modelStatus = 'loading';
    r.error = null;
    r.events = [];
    r.manual = null;
    r.pose = null;
    r.smoother = new EventSmoother(REQUIRED_SAMPLES);
    r.provider = options.demoActivity ? new DemoActivityProvider() : new BrowserActivityProvider(tasks.current);
    r.provider.start();
    r.timer = setInterval(publish, 1000);
    const engine = new CameraEngine({
      onPose(pose) {
        if (!r.running || r.engine !== engine || !mounted.current) return;
        r.pose = pose;
        // Animation updates only the transient face, not the timeline or stored events.
        setSnapshot(previous => ({ ...previous, headPose: pose }));
      },
      onInterrupted(lastFrameAt) {
        if (!r.running || r.engine !== engine) return;
        r.events.push(...r.smoother.flush(lastFrameAt));
        r.pose = null;
        publish();
      },
      onSample(sample) {
        if (r.running && r.engine === engine) r.pose = sample.pose ?? null;
        if (!r.running || r.engine !== engine) return;
        if (r.manual && sample.timestamp >= Date.parse(r.manual.endISO)) finishManual(sample.timestamp);
        if (!r.manual) r.events.push(...r.smoother.push(sample));
        publish();
      },
      onStatus(status) { if (r.running && r.engine === engine) { r.modelStatus = status; if (status === 'ready') { r.status = 'running'; r.error = null; } else if (status === 'loading') r.status = 'loading'; publish(); } },
      onError(message) { if (r.running && r.engine === engine) { r.events.push(...r.smoother.flush(Date.now())); r.error = message; r.status = 'error'; publish(); } },
    });
    r.engine = engine;
    publish();
    if (videoRef.current) await engine.start(videoRef.current);
    else { r.status = 'error'; r.modelStatus = 'error'; r.error = 'Camera preview unavailable. Session tracking can continue with manual demo controls.'; publish(); }
  }, [videoRef, options.demoActivity, publish, finishManual]);

  const simulate = useCallback((type: 'phone' | 'away', durationSec = 5) => {
    const r = runtime.current;
    if (!r.running || !Number.isFinite(durationSec) || durationSec <= 0) return;
    const now = Date.now();
    finishManual(now);
    r.events.push(...r.smoother.flush(now));
    r.manual = { id: crypto.randomUUID(), type, startISO: new Date(now).toISOString(), endISO: new Date(now + Math.min(durationSec, 86400) * 1000).toISOString(), durationSec, confidence: 1, source: 'manual' };
    publish();
  }, [finishManual, publish]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, [stop]);
  return { ...snapshot, start, stop, simulatePhone: (durationSec = 5) => simulate('phone', durationSec), simulateAway: (durationSec = 5) => simulate('away', durationSec) };
}
