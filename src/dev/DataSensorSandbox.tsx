import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { StudyRecommendation, StudySession, StudyTask } from '../contracts/morrowlab'
import { MorrowLabDB } from '../db/db'
import { createLocalMorrowLabDataService } from '../services/localMorrowLabDataService'
import { useStudySensors, type SensorResult } from '../features/sensors/useStudySensors'

// Disposable development entry point, with a separate persistent test workspace.
const service = createLocalMorrowLabDataService(new MorrowLabDB('MorrowLabSandbox'))

export function Sandbox() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const sensors = useStudySensors(videoRef)
  const [camera, setCamera] = useState(false)
  const [tasks, setTasks] = useState<StudyTask[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [recommendations, setRecommendations] = useState<StudyRecommendation[]>([])
  const [insights, setInsights] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [active, setActive] = useState<StudySession>()
  const [stopped, setStopped] = useState<SensorResult>()
  const [focus, setFocus] = useState(4)
  const [understanding, setUnderstanding] = useState(4)
  const [completion, setCompletion] = useState(80)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function refresh() {
    const [nextTasks, nextSessions, nextInsights, nextRecommendations] = await Promise.all([
      service.listTasks(), service.getRecentSessions(), service.getInsights(), service.getTomorrowRecommendations(),
    ])
    setTasks(nextTasks); setSessions(nextSessions); setInsights(nextInsights); setRecommendations(nextRecommendations)
    setSelected(previous => nextTasks.some(t => t.id === previous && t.status === 'todo')
      ? previous : nextTasks.find(t => t.status === 'todo')?.id ?? '')
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  // Initial synchronization reads persisted IndexedDB data asynchronously.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void refresh().catch(error => setMessage(String(error))) }, [])
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])

  return <main>
    <h1>MorrowLab 데이터 + 센서 테스트</h1>
    <p>제품 UI 연결 전 체험 화면입니다. 별도 테스트 DB를 사용하며, 저장한 결과는 새로고침 후에도 남습니다.</p>
    <p><strong>순서:</strong> 데모 불러오기 → 과목 선택 → 시작 → 이벤트 시뮬레이션 → 자기평가 → 종료·저장</p>
    <div className="actions">
      <button disabled={busy || !!active} onClick={() => void run(async () => { await service.loadDemoWorkspace(); await refresh() })}>데모 불러오기</button>
      <button disabled={busy || !!active} onClick={() => void run(async () => { await service.resetWorkspace(); await refresh() })}>테스트 데이터 초기화</button>
    </div>
    <p role="status">{message}</p>
    <section>
      <h2>공부 세션</h2>
      <label>할 일 <select value={selected} disabled={!!active || busy} onChange={e => setSelected(e.target.value)}>
        <option value="">데모를 불러온 뒤 선택하세요</option>
        {tasks.filter(t => t.status === 'todo').map(t => <option key={t.id} value={t.id}>{t.title} · {t.estimatedMinutes}분</option>)}
      </select></label>
      <p><label><input type="checkbox" checked={camera} disabled={!!active || busy} onChange={e => setCamera(e.target.checked)} /> 실제 웹캠 사용 (선택)</label></p>
      <p>체크하지 않으면 카메라 권한 없이 수동 이벤트를 시험합니다. 실제 웹캠은 모델 다운로드가 필요하며 사람·휴대폰의 관찰 결과만 기록합니다.</p>
      {camera && <video ref={videoRef} muted playsInline style={{ width: 320, maxWidth: '100%', background: '#111' }} />}
      <div className="actions">
        <button disabled={busy || !!active || !selected} onClick={() => void run(async () => {
          const session = await service.startSession(selected)
          setActive(session); setStopped(undefined)
          await sensors.start()
        })}>공부 시작</button>
        <button disabled={!active || !!stopped} onClick={() => sensors.simulatePhone(5)}>휴대폰 5초</button>
        <button disabled={!active || !!stopped} onClick={() => sensors.simulateAway(5)}>자리 비움 5초</button>
      </div>
      <p>경과 {sensors.elapsedSeconds}초 · 휴대폰 {sensors.phoneEventCount}회 · 자리 비움 {sensors.awayEventCount}회 · 감지 상태 {sensors.currentState ?? '미확인'}</p>
      {camera && sensors.error && <p role="alert">카메라 안내: {sensors.error} 수동 테스트는 계속할 수 있습니다.</p>}
      <p>각 시뮬레이션은 실제로 5초가 지납니다. 두 버튼을 연속해서 누르면 앞 이벤트가 짧게 종료됩니다.</p>
      <div className="actions">
        <label>집중도 <select value={focus} onChange={e => setFocus(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
        <label>이해도 <select value={understanding} onChange={e => setUnderstanding(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
        <label>완료율 <select value={completion} onChange={e => setCompletion(Number(e.target.value))}>{[0, 20, 40, 60, 80, 100].map(n => <option key={n} value={n}>{n}%</option>)}</select></label>
        <button disabled={busy || !active} onClick={() => void run(async () => {
          if (!active) return
          const output = stopped ?? sensors.stop()
          setStopped(output)
          const finished = await service.finishSession(active.id, { ...output, reflection: { focus, understanding, completionPct: completion } })
          setActive(undefined); setStopped(undefined)
          setMessage(`저장 완료: Session Score ${finished.score}/100`)
          await refresh()
        })}>{stopped ? '저장 다시 시도' : '종료·저장'}</button>
      </div>
      <p>100% 완료로 저장하면 해당 할 일이 추천에서 빠집니다. 진행 중에는 이 페이지를 떠나지 마세요.</p>
    </section>
    <section><h2>분석</h2><ul>{insights.map(text => <li key={text}>{text}</li>)}</ul></section>
    <section><h2>내일 추천</h2>{recommendations.map(r => <article key={r.taskId}>
      <strong>{r.dateISO} {r.startTime} · {r.taskTitle} · {r.estimatedMinutes}분</strong>
      <ul>{r.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </article>)}</section>
    <section><h2>저장된 기록 ({sessions.length})</h2>{sessions.map(s => <details key={s.id}>
      <summary>{s.isDemoHistory ? '[데모] ' : ''}{s.taskTitle} · {new Date(s.startedAtISO).toLocaleString()} · {s.score === undefined ? '미완료' : `${s.score}점`}</summary>
      <pre>{JSON.stringify(s, null, 2)}</pre>
    </details>)}</section>
  </main>
}

if (import.meta.env.DEV) {
  const style = document.createElement('style')
  style.textContent = 'body{font:16px/1.6 system-ui,sans-serif;background:#f4f6f8;color:#17212d;margin:0}main{max-width:960px;margin:32px auto;padding:0 20px}section{background:white;padding:20px;margin:20px 0;border:1px solid #d5dce3;border-radius:8px}button,select{font:inherit;padding:8px}button{cursor:pointer}button:disabled{cursor:default}.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}summary{cursor:pointer;padding:8px}article{border-bottom:1px solid #ddd;padding:12px 0}'
  document.head.append(style)
  createRoot(document.getElementById('root')!).render(<Sandbox />)
}
