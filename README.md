# MorrowLab

> Personalized Learning Analytics & Adaptive Study Planning
> **"How do I learn best?"** 에 데이터로 답하는 제품

사용자의 실제 공부 행동(카메라 이벤트, 앱 사용)과 학습 결과(self-evaluation, recall)를 연결해
개인별 학습 패턴을 학습하고, 다음 일정을 자동으로 재배치한다.

**Core loop:** Plan → Start → Observe → Reflect → Analyze → Adapt

📄 전체 기획: [`docs/PRD.pdf`](docs/PRD.pdf) · 미결정 사항: [`docs/decisions.md`](docs/decisions.md)

## 폴더 구조 & 담당

| 폴더 | 담당 | 내용 (PRD 기준) |
|------|------|------|
| `desktop/` | Dev A — _이름_ | Desktop client: camera inference, app/site tracking, session timer, local event layer |
| `backend/` | Dev B — _이름_ | API: auth · tasks · sessions · aggregated events · recommendations / scheduling |
| `web/` | Dev C — _이름_ | Planner · dashboard · insights · reflection UI, calendar integration |
| `ml/` | 전원 | Camera behavior model, study effectiveness model, labeling · evaluation |
| `docs/` | 전원 (+ UI/UX) | PRD, API 명세, 의사결정 기록, 디자인 |

> ML은 한 명에게 몰지 않는다. data collection / labeling / evaluation은 전원 참여 (PRD 07).

## Git 규칙

### 브랜치
- `main` — 항상 실행 가능한 상태. **직접 push 금지, PR로만 머지.**
- 작업 브랜치는 사람 말고 **작업 단위**로: `<type>/<영역>-<내용>`
  - 예: `feat/desktop-camera-smoothing`, `feat/backend-session-api`, `fix/web-dashboard-chart`, `ml/camera-f1-eval`
  - type: `feat` · `fix` · `refactor` · `docs` · `ml` · `chore`
- 브랜치는 **짧게**: 가능하면 2~3일 안에 머지. 크면 쪼개기.

### 작업 흐름
```bash
git checkout main && git pull origin main          # 1. 최신 main
git checkout -b feat/backend-session-api           # 2. 브랜치 생성
# ... 작업 & 작은 커밋 ...
git pull --rebase origin main                      # 3. 올리기 전 최신화
git push -u origin feat/backend-session-api        # 4. push
# 5. GitHub에서 PR → 팀원 1명 approve → Squash and merge → 브랜치 삭제
```

### 커밋 메시지
`<영역>: <무엇을 했는지>` — 예: `desktop: phone_usage 이벤트 smoothing 추가`

### PR 규칙
- PR 템플릿 채우기 (무엇 / 왜 / 테스트 방법)
- 리뷰어 1명 approve 후 머지. 24시간 안에 리뷰해주기.
- API 스키마·이벤트 포맷처럼 **다른 영역에 영향 주는 변경**은 관련 담당자를 리뷰어로 지정.

## Privacy 규칙 (PRD 05 — 코드에서도 지킨다)

- **raw video / 카메라 프레임은 절대 커밋·업로드 금지.** inference 후 즉시 discard.
- 서버로 보내는 건 이벤트만: `{event, start, duration, confidence}`
- 학습용 데이터셋·모델 가중치는 repo에 넣지 않는다 (`.gitignore` 참고). 공유는 팀 드라이브로.
- API 키·토큰은 `.env`에만. 필요한 변수 이름은 `.env.example`에 추가.

## 시작하기

```bash
git clone https://github.com/Ericsung20/MorrowLab.git
cd MorrowLab
cp .env.example .env
```
각 영역의 실행 방법은 해당 폴더의 README에 적는다.
