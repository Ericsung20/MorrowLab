# MorrowLab

> Personalized Learning Analytics & Adaptive Study Planning
> A product that answers **"How do I learn best?"** with data.

MorrowLab observes how you actually study (camera behavior, the apps and tabs in front of you) and connects it to learning outcomes (self-evaluation, completion). It learns which study conditions work best for you and plans tomorrow around them. Everything runs locally: video, window titles and AI judgements never leave your computer.

**Core loop:** Plan → Study → Observe → Reflect → Adapt

📄 Full spec: [`docs/PRD.pdf`](docs/PRD.pdf) · Decisions: [`docs/decisions.md`](docs/decisions.md)

---

## What it does

1. **Plan:** enter your subjects and tasks once.
2. **Study:** start *one* session for the whole plan and work on whatever you like; you don't pick a task up front.
3. **Observe:**
   - **Camera** (in-browser): *Studying* (including looking down at paper or a tablet), *Phone*, *Away*, *Looking elsewhere*, *Chatting*. A 3D mascot mirrors your head.
   - **Screen:** which app or tab is in front, judged as study, *Screen distraction* (e.g. Netflix, Instagram, X, games, entertainment YouTube) or unknown. Rules decide first; titles they can't decide go to a small **local AI** model. YouTube playlists always count as study.
4. **Reflect:** MorrowLab estimates the minutes spent per task. Confirm or correct them, tick finished tasks, and rate focus and understanding.
5. **Adapt:** a Session Score, time on distracting screens, insights, and a plan for tomorrow at the times you study best.

---

## Getting Started

```bash
git clone https://github.com/Ericsung20/MorrowLab.git
cd MorrowLab
npm install
npm run dev        # http://localhost:5173
```

To recognize other tabs and apps during a session, also run a screen-activity helper (details below):

```bash
npm run companion  # Windows / developers: keep this terminal open while studying
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run companion` | Start the desktop companion (foreground app/window reporting) |
| `npm run build` | Type-check and build |
| `npm test` | Run tests once |
| `npm run lint` | Lint |

First use downloads the camera models and the local AI model (~135 MB) once; the browser caches them afterwards.

> **Windows:** don't clone into OneDrive (e.g. Desktop synced to OneDrive). OneDrive sync can corrupt the `.git` folder. Use something like `C:\Users\<you>\dev\MorrowLab`.

---

## Screen activity helpers

A web page can't see other tabs or apps, so screen tracking uses a helper. Start it **before** the session.

| Helper | Sees | Setup |
|---|---|---|
| **Desktop companion** | Foreground window of any app (games, KakaoTalk, Word…) and browser tab titles | Windows: `npm run companion`. Mac: native app (below) |
| **Chrome extension** | Exact active tab (title + URL) in Chrome-based browsers | `chrome://extensions` → Developer mode → Load unpacked → [`extension/`](extension/README.md) |

Without a helper, time outside the MorrowLab page is recorded as unknown.

### Safari and other Mac apps

On the study-session page, use **Mac companion setup → Download for Mac**, move the unzipped app to
Applications, and open it. Its setup window guides you through Accessibility and Screen Recording
permissions; the website checks readiness automatically. Mac users do not need Terminal or Node.
The app supports macOS 13+, Apple silicon and Intel.

Maintainers generate the download with `bash companion/macos/build.sh` before building the website.
Local test builds are ad-hoc signed; public downloads still require Developer ID signing and Apple
notarization. See [companion setup, packaging, and release instructions](companion/README.md).
The current companion connects to local MorrowLab pages only; hosted deployment requires additional
origin and browser local-network configuration.

---

## Tech Stack

React + TypeScript + Vite · React Router · Dexie (IndexedDB, local-first) · Recharts · date-fns · lucide-react · MediaPipe Tasks Vision (face landmarks + phone detection) · Transformers.js (local title classifier in a Web Worker) · Node + get-windows / Swift (desktop companion) · Chrome extension · Vitest + Testing Library

---

## Project Structure

```
src/
├── app/           App shell, routes, dependency wiring (dependencies.ts)
├── pages/         Dashboard, Session, Summary, Tomorrow
├── components/    Shared UI: timeline, mascot, companion setup
├── features/
│   ├── camera/        Camera engine and focus classifier (head pose, phone, people)
│   ├── activity/      Tab/app tracking, rule + local AI classification, time per task
│   ├── sensors/       useStudySensors hook combining camera and screen activity
│   ├── scoring/       Session Score
│   ├── analytics/     Study patterns by subject and time of day
│   ├── insights/      Dashboard insights
│   └── recommendations/  Tomorrow's plan
├── services/      Local data service (tasks, sessions, demo data)
├── db/            Dexie database and migrations
├── contracts/     Shared types
└── dev/           Developer sandbox (/sandbox.html)
companion/         Desktop companion (Node for Windows, native Swift app for macOS)
extension/         Chrome extension
docs/              PRD, decisions
```

`src/data/`, `src/shared/`, `src/sensors/` and `src/ui/` are unused early scaffolding.
More detail: [`src/app/INTEGRATION.md`](src/app/INTEGRATION.md).

---

## Git Workflow

`main` is the shared, working version. Don't push to it directly.

```bash
git checkout main
git pull                          # start from the latest main
git checkout -b fix/phone-detection   # one branch per change
# work, then commit in small steps
git commit -m "camera: count phones held up in front of the face"
git push -u origin fix/phone-detection
```

Open a PR **`your-branch` → `main`** on GitHub. Before opening it, `npm run build && npm test && npm run lint` must pass. Merge with **Squash and merge** so `main` gets one commit per change, then delete the branch.

### Commit messages

```
<area>: <what you did>
```

`camera: …` · `activity: …` · `session: …` · `data: …` · `companion: …` · `docs: …`

### Resolving conflicts

```bash
git pull origin main
# Open the conflicted files, fix the <<<<<<< ======= >>>>>>> blocks
git add <file>
git commit
git push
```

> Lockfile conflict? Take `main`'s version: `git checkout --theirs package-lock.json && npm install`.
> Stuck for more than 15 minutes? Ask the team.

---

## Privacy Rules

These come from PRD §05 and apply to the code as well:

- **Never store, commit, or upload raw video or camera frames.** Inference runs in the browser; frames are discarded immediately.
- Only aggregated events are stored locally: camera events `{type, start/end, durationSec, confidence}` and screen segments `{label, host, category, durationSec}` (see `src/contracts/morrowlab.ts`). Full URLs are never stored.
- Window titles are sent only from the local companion/extension to MorrowLab pages on `localhost`; the title classifier runs on-device.
- Datasets and model weights do **not** go in this repo (see `.gitignore`).
- API keys and tokens go in `.env` only. Add the variable *name* to `.env.example`.
