# Study sensor integration

From the existing `src/ui/pages/Session.tsx`:

```tsx
import { useRef } from 'react';
import { useStudySensors } from '../../features/sensors/useStudySensors';

const videoRef = useRef<HTMLVideoElement>(null);
const sensors = useStudySensors(videoRef); // optional second argument: { demoActivity: true }
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
`cameraEvents`, `activitySegments`, `error`, `start`, `stop`,
`simulatePhone(durationSec = 5)`, `simulateAway(durationSec = 5)`.

`setStudyMode('strict' | 'research' | 'lecture')` selects how future off-page
intervals are labeled, before or during a session. Strict is the default.
Research/lecture are self-declared study purposes, not classification of another
website's content. Switching mode closes the previous interval without relabeling
past time. Return to strict mode when external study ends. Labels are defined in
`src/contracts/activity.ts`; the persisted `ActivitySegment` shape is unchanged.

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
- `currentState` is null before three confirming predictions and after stop.
  “Studying” means a detected person with no detected phone; it does not measure
  attention, gaze, emotion, or mental state. Absence confidence 0.7 is heuristic.
- COCO-SSD lite loads lazily. Model weights require network access unless cached;
  frames stay local. Inferences use a transient 320×240 canvas and an 850 ms delay
  after each inference. Phone threshold is 0.35, person threshold is 0.55.
- Three consecutive samples confirm a state, backdated to the first sample.
  Sub-500 ms model intervals and unconfirmed initial candidates are discarded.
- Browser activity reflects this document's visibility and focus only. The demo
  provider produces synthetic native-app labels marked `source: 'demo'`.
- Shared output types live in `src/contracts/morrowlab.ts`. The older
  `src/shared/types.ts` and `src/sensors/index.ts` interfaces are separate legacy
  scaffolding; use this hook and the new contract for integration.

No video, image, blob, screenshot, or base64 data is persisted or sent by these
modules. The only outputs are interval metadata. Models are released on stop;
each new session loads its own model, and duplicate starts never load twice.
