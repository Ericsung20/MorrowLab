# Integrated frontend

The UI consumes domain types from `src/contracts/morrowlab.ts`, service interfaces from
`src/contracts/services.ts`, and runtime dependencies **only** from `src/app/dependencies.ts`, which
binds the real `localMorrowLabDataService` and adapts the sensor hook to `StudySensorBinding`.
The product uses `MorrowLabDB`; `/sandbox.html` uses the separate `MorrowLabSandbox` database.

## Study model

The student enters their tasks (subject + task) once. A **study session is not tied to one task**:
they start one session, work on whatever they want, and MorrowLab estimates the time spent per task
(`estimateTaskTime` in `src/features/activity/classifyActivity.ts`):

- Tabs whose title matches a task's words are credited to that task.
- Non-distracting time without a match (e.g. back on MorrowLab, writing on paper) goes to the most
  recently matched task. With a single task on the plan, all time goes to it.
- Distracting tabs and camera off-task time (phone, away, looking elsewhere, chatting) are excluded.

At reflection the student confirms or corrects the minutes per task and ticks finished tasks.
`finishSession` stores `taskBreakdown` and marks `completedTaskIds` done. `session.subject` is the
subject with the most time, or `General`.

## Screen activity

A web page can't see other tabs or apps. Two optional helpers fill that in:

- **Desktop companion** (`npm run companion`, see `companion/README.md`): reports the foreground window
  of any app (games, KakaoTalk, Word…), classified by `classifyWindow`. Browser windows are judged
  from their title.
- **Browser extension** (`extension/`): reports the exact active tab (title + URL); preferred for tabs.

Titles are judged by rules first (`classifyActivity.ts`: known sites/apps, study/play words, task names).
Titles the rules can't decide go to a **local AI** (`aiClassifier.ts` + `aiWorker.ts`): a small multilingual
sentence model (~135 MB, downloaded once and cached by the browser) running in a Web Worker compares the title
with example phrases for study / play / everyday tools. Nothing leaves the device. Low-confidence answers stay
neutral, and a title with study words is never judged a distraction.

Without either helper, other tabs/apps are recorded as neutral "other tab/window" time. Classified time is
study, distraction or neutral (for example, YouTube is judged by video title).

## Product routes

- `/`: dashboard, task creation, demo loading, confirmed reset, "Start study session"
- `/session`: monitoring followed by inline reflection with per-task time
- `/summary/:sessionId`: saved score, time per task, metrics, behavior, activity, reflection
- `/tomorrow`: recommendation timeline and history provenance
- Unknown paths (including old `/session/:taskId` links) redirect to `/`.

A session is created on Start monitoring. Finish session saves only after monitoring has stopped and
the reflection is submitted. Camera permission/model loading never blocks ending the session or the
manual controls. Physical camera and model recognition still require a manual browser check.

Run `npm run dev`, `npm run build`, `npm test`, and `npm run lint`.
