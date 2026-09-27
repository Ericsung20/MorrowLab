# Study sensor integration

From the existing `src/ui/pages/Session.tsx`:

```tsx
import { useRef } from 'react';
import { useStudySensors } from '../../features/sensors/useStudySensors';

const videoRef = useRef<HTMLVideoElement>(null);
const sensors = useStudySensors(videoRef, { tasks }); // tasks: match tabs to tasks; also { demoActivity: true }
// Render <video ref={videoRef} muted playsInline /> before starting.
// In a user click handler:
await sensors.start();
// Later, pass the final arrays to the persistence service:
const { cameraEvents, activitySegments } = sensors.stop();
```

The repository currently has no `@` alias. If the UI engineer configures one,
the equivalent import is `@/features/sensors/useStudySensors`.

Public fields: `status`, `modelStatus`, `currentState`, `confidence`,
`elapsedSeconds`, `studySeconds`, `phoneEventCount`, `awayEventCount`,
`offTaskEventCount`, `extensionConnected`, `cameraEvents`, `activitySegments`,
`error`, `start`, `stop`, `simulatePhone(durationSec = 5)`, `simulateAway(durationSec = 5)`.

- `start()` is asynchronous and idempotent while monitoring. Invoke only on a
  user action. A rendered video element, secure context (HTTPS or localhost),
  and camera permission are needed for camera inference.
- The timer and activity tracking start before camera/model initialization.
  `status: 'error'` is a recoverable camera warning: the session remains running
  until `stop()`. Manual simulation requires a started session but no webcam.
  If model loading or inference fails after video playback starts, the preview
  stays live while automatic detection stops. The error identifies the failed
  stage. Explicit `stop()` or unmount still releases the camera tracks.
- Manual controls create real-time intervals, replace a previous manual interval,
  suppress model samples during the interval, and truncate at stop. They never
  fabricate future completed events. Confidence 1 means a certain manual action,
  not model evidence.
- Arrays exposed while running include a snapshot of the active interval. Persist
  the final arrays returned by `stop()` once, rather than appending every render.
  `stop()` is synchronous (also safe to await), idempotent, and flushes intervals.
- A restart starts a fresh session. Unmount stops tracks, listeners, and timers;
  callers should finish/persist explicitly before navigating away.
- Camera states (`FocusClassifier` in `src/features/camera/cameraTypes.ts`):
  - `studying`: facing the screen **or looking down** at paper/tablet; also a visible
    body with a hidden face (head far down while writing).
  - `phone`: a phone is detected while the student looks down/away or their face is
    hidden. A phone lying on the desk while they face the screen is ignored. The
    state is held 2 s after the last detection so a partly visible phone doesn't flicker.
  - `distracted`: head turned sideways or looking up (confirmed after ~5 s, so
    glances don't count).
  - `talking`: another person in frame and the student turns to them or keeps moving
    their mouth.
  - `away`: nobody in frame.
  Head pose is measured relative to the student's own pose over the first ~3 s
  (assumed to be looking at the screen), so camera placement doesn't matter. The
  thresholds are the `FOCUS_TUNING` constants; tune them against real footage.
- MediaPipe EfficientDet-Lite2 (phone/person) and Face Landmarker (head pose, mouth)
  load lazily, GPU first with a CPU fallback. Model files (~27 MB) need network
  access once, then come from the browser cache; frames stay local. Inference runs
  every 500 ms on the video element directly.
- `REQUIRED_SAMPLES` sets how many consecutive samples confirm each state, backdated to
  the first sample. Sub-500 ms model intervals and unconfirmed candidates are discarded.
- Browser activity: this page's visibility/focus, plus the active tab's title/host
  when the MorrowLab extension (`/extension`) is installed. Tabs are classified as
  study, distraction or neutral by `classifyActivity`. The demo provider produces
  synthetic native-app labels marked `source: 'demo'`.
- Shared output types live in `src/contracts/morrowlab.ts`. The older
  `src/shared/types.ts` and `src/sensors/index.ts` interfaces are separate legacy
  scaffolding; use this hook and the new contract for integration.

No video, image, blob, screenshot, or base64 data is persisted or sent by these
modules. The only outputs are interval metadata. Models are released on stop;
each new session loads its own model, and duplicate starts never load twice.

### Live 3D mascot expressions

The simple sprout mascot has a matte dumpling shape, tiny dot eyes, and a minimal mouth, rendered as lit 3D geometry with depth occlusion. It uses the largest visible face's head pose and MediaPipe blendshapes:
independent left/right blinks, horizontal/vertical eye movement, jaw opening, and smile.
Facial animation runs at up to 20 Hz (device performance permitting); object detection, calibration,
and behavior classification remain on their 500 ms cadence. Animation frames do not advance
study-event smoothing. Tracking resets to a neutral face on face loss, stopped video, or inference
failure. `headPose.expression` is transient UI data and is never included in saved camera events.

### Camera interruptions and long sessions

The camera engine only classifies fresh video frames. Healthy background sessions continue at 2 Hz;
visible facial animation runs up to 20 Hz. Muted/stalled background streams wait for the browser to
resume instead of permanently failing after ten seconds. Visibility/page restoration resumes video
playback and allows a fresh-frame grace period. Ended tracks or foreground stalls reconnect the
camera; inference failures rebuild models on CPU. Recovery is limited to three attempts per failure
period, with backoff after failed requests; ten healthy seconds reset the budget. Permission denials
stop retries. Ending a session removes listeners, timers and models and stops late-arriving streams.

During interruptions, the last camera event ends at the last observed frame. Missing camera time is
not silently included in the preceding study event. Session timers, screen activity, and manual
controls remain available. Recovery is tested with simulated one-hour background/sleep intervals;
actual browser/OS camera suspension still depends on the user's device and permissions.
