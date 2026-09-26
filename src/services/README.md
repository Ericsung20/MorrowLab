# MorrowLab data engine integration

Import the singleton from a UI module (adjust the relative path):

```ts
import { localMorrowLabDataService } from '../services/localMorrowLabDataService'
import type { StudySession, StudyTask } from '../contracts/morrowlab'
```

The singleton implements the exact `MorrowLabDataService` interface in
`src/contracts/services.ts`: `listTasks`, `createTask`, `getTask`, `startSession`,
`finishSession`, `getSession`, `getRecentSessions`, `getInsights`,
`getTomorrowRecommendations`, `loadDemoWorkspace`, and `resetWorkspace`.
All operations return promises. Catch rejected promises to display validation or
storage errors. Components do not need to import Dexie or the pure engines.

## Storage and lifecycle

- The new IndexedDB database is named `MorrowLabDB`, schema version 1. It is
  separate from the starter `src/data/db.ts` database named `morrowlab`; no legacy
  data migration is performed. Use the new string-ID contracts, not
  `src/shared/types.ts`'s numeric-ID starter types.
- Starting a session persists it immediately. Finishing persists its reflection,
  observations, elapsed wall-clock seconds, and calculated Session Score in one
  transaction. A second finish rejects to prevent accidental replacement.
- A reflection with `completionPct === 100` marks its task done in the same
  transaction. Lower percentages leave it unfinished. The assigned interface
  has no independent task completion/edit/delete method.
- Ratings accept finite numbers from 1–5; completion accepts 0–100. Camera
  confidence accepts 0–1. Event durations must be finite and non-negative with
  valid ordered timestamps. Camera observations may be empty when unavailable;
  the specified formula then assigns the full 10% behavior contribution.
- `getRecentSessions` returns all persisted sessions, newest first, including
  active ones. Analytics only use completed sessions with a reflection and a
  finite score. Recommendations are recomputed on every call, so call again
  after `finishSession` to refresh the UI; the service does not push updates.
- Demo loading adds three tasks and seven histories once, preserving existing
  data. An empty workspace gets exactly those counts. Reset clears tasks,
  sessions, and settings atomically, allowing demo loading again.

## Analytics and scheduling conventions

- Time buckets use the device's current local timezone. Morning is 06:00–11:59,
  afternoon 12:00–17:59, and evening 18:00–05:59.
- `dateISO` in recommendations is a local `YYYY-MM-DD` calendar date; `startTime`
  is local `HH:mm`. Other persisted timestamps are UTC ISO strings.
- `recommendationScore` and time fit are 0–1; Session Score is an integer 0–100.
- One completed subject/bucket session is enough for an initial subject fit.
  Reasons expose the sample count. Missing subject/bucket data falls back to
  the overall bucket, then a neutral 0.5 fit. Demo history participates in these
  calculations and is marked `isDemoHistory` for UI disclosure.
- Tasks receive slots in urgency order; returned blocks are chronological.
  Equal-scoring candidates prefer earlier times. Each task occupies its entire
  estimated duration, with no overlaps or blocks extending past tomorrow.
  Tasks that do not fit the six candidate start times are omitted; compare task
  IDs to display unscheduled work. Deadlines affect priority, not a hard cutoff;
  reasons flag a block ending after tomorrow's deadline.
- Optional headless utility `compareTimeFit(subject, bucket, previousSessions,
  currentSessions)` returns `previousFit`, `currentFit`, and their actual `delta`
  on the 0–1 scale. No UI should fabricate a before/after change.

## Validation

`npm test` covers scoring, bucket boundaries, analytics, insights, scheduling,
demo data, and the service through real Dexie operations backed by
`fake-indexeddb` in Vitest. The latter is the only added dev dependency because
jsdom does not provide IndexedDB. Persistence is tested by closing and reopening
the database. `npm run build` checks TypeScript and builds the starter app.
The new service must still be wired into Engineer 1's UI.
