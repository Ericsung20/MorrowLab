import { useEffect, useRef, useState } from "react";
import type {
  StudySensorBinding,
  SensorLiveState,
} from "../contracts/services";
import type {
  CameraEvent,
  CameraEventType,
  ActivitySegment,
} from "../contracts/morrowlab";
export function useMockStudySensors(): StudySensorBinding {
  const videoRef = useRef<HTMLVideoElement>(null);
  const active = useRef(false);
  const began = useRef(0);
  const segmentStart = useRef(0);
  const current = useRef<CameraEventType>("studying");
  const resumeAt = useRef(0);
  const events = useRef<CameraEvent[]>([]);
  const [state, setState] = useState<SensorLiveState>({
    status: "idle",
    studySeconds: 0,
    phoneEventCount: 0,
    awayEventCount: 0,
    cameraEvents: [],
    activitySegments: [],
  });
  function event(end: number): CameraEvent {
    return {
      id: crypto.randomUUID(),
      type: current.current,
      startISO: new Date(segmentStart.current).toISOString(),
      endISO: new Date(end).toISOString(),
      durationSec: Math.max(0, (end - segmentStart.current) / 1000),
      confidence: 0.96,
      source: "manual",
    };
  }
  function activity(end: number): ActivitySegment[] {
    return began.current
      ? [
          {
            id: "demo-study",
            label: "Study workspace (demo)",
            startISO: new Date(began.current).toISOString(),
            endISO: new Date(end).toISOString(),
            durationSec: (end - began.current) / 1000,
            source: "demo",
          },
        ]
      : [];
  }
  function snapshot(now: number) {
    const all = active.current
      ? [...events.current, event(now)]
      : [...events.current];
    setState({
      status: active.current ? "running" : "idle",
      currentState: current.current,
      confidence: 0.96,
      studySeconds: all
        .filter((e) => e.type === "studying")
        .reduce((n, e) => n + e.durationSec, 0),
      phoneEventCount: all.filter((e) => e.type === "phone").length,
      awayEventCount: all.filter((e) => e.type === "away").length,
      cameraEvents: all,
      activitySegments: activity(now),
    });
  }
  function change(type: CameraEventType, now: number) {
    events.current.push(event(now));
    segmentStart.current = now;
    current.current = type;
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!active.current) return;
      const now = Date.now();
      if (resumeAt.current && now >= resumeAt.current) {
        change("studying", resumeAt.current);
        resumeAt.current = 0;
      }
      snapshot(now);
    }, 250);
    return () => {
      clearInterval(timer);
      active.current = false;
    };
  }, []);
  function simulate(type: "phone" | "away", seconds = 5) {
    if (!active.current) return;
    const now = Date.now();
    change(type, now);
    resumeAt.current = now + Math.max(1, seconds) * 1000;
    snapshot(now);
  }
  return {
    state,
    videoRef,
    isMock: true,
    controller: {
      async start() {
        if (active.current) return;
        const now = Date.now();
        began.current = now;
        segmentStart.current = now;
        current.current = "studying";
        events.current = [];
        resumeAt.current = 0;
        active.current = true;
        snapshot(now);
      },
      async stop() {
        const now = Date.now();
        if (active.current) events.current.push(event(now));
        active.current = false;
        snapshot(now);
        return {
          cameraEvents: [...events.current],
          activitySegments: activity(now),
        };
      },
      simulatePhone: (seconds) => simulate("phone", seconds),
      simulateAway: (seconds) => simulate("away", seconds),
    },
  };
}
