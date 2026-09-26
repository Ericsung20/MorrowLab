# MorrowLab

> Personalized Learning Analytics & Adaptive Study Planning
> A product that answers **"How do I learn best?"** with data.

MorrowLab observes how you actually study (camera behavior events, app/site usage) and connects it to learning outcomes (self-evaluation, recall). It learns which study conditions work best for you and automatically reschedules your next sessions.

**Core loop:** Plan → Start → Observe → Reflect → Analyze → Adapt

📄 Full spec: [`docs/PRD.pdf`](docs/PRD.pdf) · Open questions: [`docs/decisions.md`](docs/decisions.md)

---

## Project Structure

```
MorrowLab/
├── desktop/     Desktop client — camera inference, app/site tracking, session timer
├── backend/     API — auth, tasks, sessions, aggregated events, recommendations
├── web/         Web app — planner, dashboard, insights, reflection
├── ml/          Camera behavior model, study effectiveness model, evaluation
├── docs/        PRD, API spec, decision log, design
└── .github/     PR template
```

| Folder | Owner | Scope |
|--------|-------|-------|
| `desktop/` | Dev A — _name_ | Camera pipeline, local event layer, local inference optimization |
| `backend/` | Dev B — _name_ | Data model, API, scheduling logic, deployment |
| `web/` | Dev C — _name_ | Planner, dashboard, reflection UI, calendar integration |
| `ml/` | Everyone | Data collection, labeling, training, evaluation |
| `docs/` | Everyone + UI/UX | Specs, decisions, design |

> ML is not owned by one person. Everyone takes part in data collection, labeling, and evaluation.

---

## Git Workflow

### Branches

```
main ─────●─────────●─────────●─────────●──────▶   always runnable, protected
           \       /  \       /  \       /
            ●──●──●    ●──●──●    ●──●──●
     feat/desktop-   feat/backend-   fix/web-
     camera-events   session-api     chart-bug
```

- **`main`** is always runnable. **No direct pushes.** Everything goes in through a Pull Request.
- **Work branches** are named after the *task*, not the person:
  `<type>/<area>-<short-description>`

| Type | Use for | Example |
|------|---------|---------|
| `feat` | New feature | `feat/backend-session-api` |
| `fix` | Bug fix | `fix/web-dashboard-chart` |
| `ml` | Model / data / evaluation work | `ml/camera-f1-eval` |
| `refactor` | Code cleanup, no behavior change | `refactor/desktop-event-layer` |
| `docs` | Documentation | `docs/api-spec` |
| `chore` | Config, dependencies, tooling | `chore/setup-eslint` |

- Keep branches **short-lived**: merge within 2–3 days. If it's bigger, split it.

### Daily Flow

```bash
# 1. Start from the latest main
git checkout main
git pull origin main

# 2. Create a branch for your task
git checkout -b feat/backend-session-api

# 3. Work and commit in small steps
git add .
git commit -m "backend: add session start/end endpoints"

# 4. Sync with main before pushing
git pull --rebase origin main
git push -u origin feat/backend-session-api
```

Then on GitHub:

1. Click **Compare & pull request**
2. Fill in the PR template and add **1 reviewer**
3. After approval → **Squash and merge** → **Delete branch**
4. Locally: `git checkout main && git pull origin main`

### Commit Messages

```
<area>: <what you did>
```

Examples:
- `desktop: add smoothing for phone_usage events`
- `backend: add GET /sessions/:id`
- `web: show weekly distraction chart`
- `ml: add confusion matrix to eval script`

### Pull Request Rules

- One PR = one task. Keep it reviewable (ideally < 400 lines).
- At least **1 approval** before merging. Review within **24 hours**.
- Changes that affect another area (API schema, event format, DB model) → add that area's owner as a reviewer.
- Never merge your own PR without a review.

### Resolving Conflicts

```bash
git pull --rebase origin main
# Open the conflicted files, fix the <<<<<<< ======= >>>>>>> blocks
git add <file>
git rebase --continue
git push --force-with-lease
```

> `--force-with-lease` is OK **only on your own work branch**. Never force-push to `main`.
> Stuck for more than 15 minutes? Ask the team.

---

## Privacy Rules

These come from PRD §05 and apply to the code as well:

- **Never commit or upload raw video or camera frames.** Discard frames right after inference.
- The server only receives events: `{event, start, duration, confidence}`
- Datasets and model weights do **not** go in this repo (see `.gitignore`). Share them through the team drive.
- API keys and tokens go in `.env` only. Add the variable *name* to `.env.example`.

---

## Getting Started

```bash
git clone https://github.com/Ericsung20/MorrowLab.git
cd MorrowLab
cp .env.example .env
```

See the README in each folder for how to run that part.

> **Windows:** don't clone into OneDrive (e.g. Desktop synced to OneDrive). OneDrive sync can corrupt the `.git` folder. Use something like `C:\Users\<you>\dev\MorrowLab`.
