# Frontend handoff

The UI consumes domain types from `src/contracts/morrowlab.ts`, service interfaces from `src/contracts/services.ts`, and runtime dependencies **only** from `src/app/dependencies.ts`.

## Engineer 2

Connect your `MorrowLabDataService` implementation in `src/app/dependencies.ts`, replacing `mockMorrowLabDataService`. Do not change pages. All methods are asynchronous; reject with a user-readable Error when an operation fails. Completed sessions should include their score, reflection, camera events, and activity segments. `getRecentSessions()` should return completed sessions. Recommendations should reference unfinished tasks, supply a date and 24-hour `HH:mm` start time, and include explanation strings.

The isolated mock stores data under `morrowlab.ui-mock.v1`; it does not share a database with production services. Its score is deliberately fixed at 84 and insights are fixtures. Replace `isDemoAdapter` with false once live data/scoring is connected. Demo-history status remains determined from `StudySession.isDemoHistory`.

## Engineer 3

Connect your sensor hook through `useStudySensors` in `src/app/dependencies.ts`. Adapt it to `StudySensorBinding` in `src/contracts/services.ts`: `{ state, controller, videoRef, isMock }`. The controller methods are exactly `start`, `stop`, `simulatePhone`, and `simulateAway` from the shared contract. The frontend attaches `videoRef` to an autoplay, muted, playsInline video element. Set `isMock: false` to reveal it. The hook owns media attachment, stopping tracks, and cleanup on unmount. Starting happens only after the explicit Start monitoring button; `stop()` must return finalized event arrays. Surface live failures through `state.error` and rejected controller promises.

The mock never requests camera permission and never infers browser activity. It produces explicitly labeled demo activity and manual-source events. Simulations last five real seconds by default before returning to studying.

## Product routes

- `/`: dashboard, onboarding, task creation, demo loading, confirmed reset
- `/session/:taskId`: monitoring followed by inline reflection
- `/summary/:sessionId`: saved score, metrics, behavior, activity, reflection
- `/tomorrow`: recommendation timeline and history provenance
- Unknown paths redirect to `/`.

A session is created on Start monitoring. Finish session saves only after monitoring has stopped and reflection is submitted. Reloading/leaving before saving can lose in-flight events; the session page warns on browser reload. An incomplete session is not presented as completed history.

Run `npm run dev`, `npm run build`, `npm test`, and `npm run lint`. The app integration tests exercise the full demo/reflection path, task creation, reset confirmation, missing records, and unknown routes.
