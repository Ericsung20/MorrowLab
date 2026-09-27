# MorrowLab

> Personalized Learning Analytics & Adaptive Study Planning
> A product that answers **"How do I learn best?"** with data.

MorrowLab observes how you actually study (camera behavior events, tab/app activity) and connects it to learning outcomes (self-evaluation, recall). It learns which study conditions work best for you and automatically reschedules your next sessions.

**Core loop:** Plan → Start → Observe → Reflect → Analyze → Adapt

📄 Full spec: [`docs/PRD.pdf`](docs/PRD.pdf) · Open questions: [`docs/decisions.md`](docs/decisions.md)

---

## Tech Stack

React + TypeScript + Vite · React Router · Dexie (IndexedDB, local-first) · Recharts · date-fns · lucide-react · MediaPipe Tasks Vision (in-browser face + phone detection) · Chrome extension for tab tracking (`extension/`) · Vitest + Testing Library

## Getting Started

```bash
git clone https://github.com/Ericsung20/MorrowLab.git
cd MorrowLab
git checkout integration-base
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build |
| `npm test` | Run tests once |
| `npm run lint` | Lint |

> **Windows:** don't clone into OneDrive (e.g. Desktop synced to OneDrive). OneDrive sync can corrupt the `.git` folder. Use something like `C:\Users\<you>\dev\MorrowLab`.

---

## Safari and other Mac apps

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

## Project Structure

```
src/
├── app/         App shell and routes                (shared)
├── shared/      Types shared by every module         (shared — coordinate before editing)
├── ui/          Pages, components, styling           → feature/ui
├── data/        Dexie DB, tasks/sessions, analytics, scheduling  → feature/data-engine
└── sensors/     Camera behavior detection, tab/app activity      → feature/sensors
docs/            PRD, decisions
```

Each feature branch owns one folder. Modules talk to each other only through `src/shared/types.ts` and each folder's `index.ts`.

---

## Git Workflow

### Branches

```
main              ●───────────────────────────────●────▶   stable / demo-ready
                   \                             /
integration-base    ●─────●─────────●─────────●─●──────▶   everyone merges here
                     \   / \       /  \      /
feature/ui            ●─●   \     /    \    /
feature/data-engine          ●─●─●      \  /
feature/sensors                          ●●
```

| Branch | Purpose | Who pushes |
|--------|---------|-----------|
| `main` | Stable, demo-ready version | Merged from `integration-base` only, when it works end-to-end |
| `integration-base` | Shared working base. Always builds and runs | Merged from feature branches via PR |
| `feature/ui` | Pages, components, styling (`src/ui/`) | UI owner |
| `feature/data-engine` | Storage, analytics, scheduling (`src/data/`) | Data owner |
| `feature/sensors` | Camera + activity tracking (`src/sensors/`) | Sensors owner |

### Setup (once per computer)

```bash
git clone https://github.com/Ericsung20/MorrowLab.git
cd MorrowLab
git checkout <your-feature-branch>     # feature/ui, feature/data-engine, or feature/sensors
npm install
```

### Daily Flow

```bash
# 1. Get the latest shared work into your branch
git checkout feature/ui
git pull origin integration-base

# 2. Work and commit in small steps
git add .
git commit -m "ui: add planner task list"

# 3. Push your branch
git push origin feature/ui
```

When a piece works, open a PR on GitHub: **`feature/ui` → `integration-base`**.
After 1 approval → **Merge** (keep the feature branch; you keep working on it).
Then everyone else runs `git pull origin integration-base` in their own branch.

**Release to main:** when `integration-base` builds, passes tests, and the core loop works, open a PR **`integration-base` → `main`**.

### Rules

1. **Don't touch `package.json` / `package-lock.json` in feature branches.** Need a new dependency? Add it on `integration-base` first (small PR), then everyone pulls it. This avoids lockfile conflicts.
2. **Stay in your folder.** Changing `src/shared/types.ts` or `src/app/` → tell the team first and merge that change quickly.
3. **Merge into `integration-base` often** (at least daily). Small merges = small conflicts.
4. **Before opening a PR:** `npm run build && npm test` must pass.
5. **Never push directly to `main`.**

### Commit Messages

```
<area>: <what you did>
```

`ui: add session timer page` · `data: add daily completion stats` · `sensors: detect phone with coco-ssd` · `shared: add Reflection type`

### Resolving Conflicts

```bash
git pull origin integration-base
# Open the conflicted files, fix the <<<<<<< ======= >>>>>>> blocks
git add <file>
git commit
git push origin <your-branch>
```

> Lockfile conflict? Take the `integration-base` version: `git checkout --theirs package-lock.json && npm install`.
> Stuck for more than 15 minutes? Ask the team.

---

## Privacy Rules

These come from PRD §05 and apply to the code as well:

- **Never store, commit, or upload raw video or camera frames.** Run inference in the browser and discard frames immediately.
- Only aggregated events are stored: `{event, start, durationSec, confidence}` (see `SensorEvent` in `src/shared/types.ts`).
- Datasets and model weights do **not** go in this repo (see `.gitignore`).
- API keys and tokens go in `.env` only. Add the variable *name* to `.env.example`.
