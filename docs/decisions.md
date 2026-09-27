# Decisions

## Open Questions — decide in Sprint 0 (PRD §09)

| # | Question | Decision | Date |
|---|----------|----------|------|
| 1 | Desktop client: Windows or macOS first? | | |
| 2 | Camera classes: start with 3 or 5? | | |
| 3 | Desktop activity: apps only, or browser domains too? | | |
| 4 | Mini quiz: in MVP or P1? | | |
| 5 | Recommended schedule: auto-apply to calendar, or after approval? | | |
| 6 | Opt-in UX for using beta data in model training? | | |

## Tech Stack

| Area | Choice | Why |
|------|--------|-----|
| Platform | Web app (browser) | TF.js runs camera inference locally in the browser |
| Storage | Dexie (IndexedDB) | Local-first, no raw data leaves the device |
| Frontend | React + TypeScript + Vite | |
| Charts | Recharts | |
| ML | MediaPipe Tasks Vision (EfficientDet-Lite2 + Face Landmarker) | Phone/person detection + head pose → studying / phone / away / distracted / talking |

## Decision Log

<!-- Format: ### YYYY-MM-DD — Title / Decision / Why / Alternatives considered -->
