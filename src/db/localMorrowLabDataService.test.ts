import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MorrowLabDB } from './db'
import { createLocalMorrowLabDataService } from '../services/localMorrowLabDataService'

describe('Dexie local data service', () => {
  let db: MorrowLabDB
  let clock: Date
  let service: ReturnType<typeof createLocalMorrowLabDataService>
  beforeEach(() => {
    db = new MorrowLabDB(`test-${crypto.randomUUID()}`)
    clock = new Date(2026, 8, 26, 9)
    service = createLocalMorrowLabDataService(db, () => clock)
  })
  afterEach(async () => { await db.delete() })
  const input = { title: ' Calculus ', subject: ' Math ', estimatedMinutes: 45, deadlineISO: '2026-09-27T23:00:00.000Z' }

  it('persists a task and an immediately started session across database reopen', async () => {
    const task = await service.createTask(input)
    expect(task.title).toBe('Calculus')
    expect(task.subject).toBe('Math')
    const session = await service.startSession()
    expect(session).toMatchObject({ subject: 'General', durationSec: 0, cameraEvents: [], activitySegments: [], taskBreakdown: [] })
    db.close()
    await db.open()
    expect(await service.getTask(task.id)).toEqual(task)
    expect(await service.getSession(session.id)).toEqual(session)
  })
  it.each([
    { title: ' ' }, { subject: ' ' }, { estimatedMinutes: 0 }, { estimatedMinutes: -1 },
    { estimatedMinutes: Infinity }, { deadlineISO: 'invalid' }, { deadlineISO: '' },
  ])('rejects invalid task input %j', async patch => {
    await expect(service.createTask({ ...input, ...patch })).rejects.toThrow()
    expect(await service.listTasks()).toHaveLength(0)
  })
  const none = { cameraEvents: [], activitySegments: [], taskBreakdown: [], completedTaskIds: [] }
  it('returns undefined on missing reads and useful errors for missing finishes', async () => {
    expect(await service.getTask('missing')).toBeUndefined()
    expect(await service.getSession('missing')).toBeUndefined()
    await expect(service.finishSession('missing', { ...none, reflection: { focus: 5, understanding: 5, completionPct: 100 } })).rejects.toThrow('not found')
  })
  it('finishes and scores a multi-task session, records time per task, and completes chosen tasks', async () => {
    const task = await service.createTask(input)
    const other = await service.createTask({ ...input, title: 'Essay', subject: 'English' })
    const started = await service.startSession()
    clock = new Date(clock.getTime() + 600_000)
    const finished = await service.finishSession(started.id, { ...none, reflection: { focus: 5, understanding: 5, completionPct: 100, note: 'Done' },
      taskBreakdown: [{ taskId: task.id, seconds: 360 }, { taskId: other.id, seconds: 240 }, { taskId: other.id, seconds: 0 }], completedTaskIds: [task.id] })
    expect(finished.durationSec).toBe(600)
    expect(finished.score).toBe(100)
    expect(finished.subject).toBe('Math')
    expect(finished.taskBreakdown).toEqual([
      { taskId: task.id, taskTitle: 'Calculus', subject: 'Math', seconds: 360 },
      { taskId: other.id, taskTitle: 'Essay', subject: 'English', seconds: 240 },
    ])
    expect(await service.getSession(started.id)).toEqual(finished)
    expect((await service.getTask(task.id))!.status).toBe('done')
    expect((await service.getTask(other.id))!.status).toBe('todo')
    expect((await service.getTomorrowRecommendations()).map(r => r.taskId)).toEqual([other.id])
    await expect(service.finishSession(started.id, { ...none, reflection: { focus: 1, understanding: 1, completionPct: 0 } })).rejects.toThrow('already')
  })
  it('rejects invalid reflections, unknown tasks and negative times without finishing the session', async () => {
    const session = await service.startSession()
    await expect(service.finishSession(session.id, { ...none, reflection: { focus: 6, understanding: 5, completionPct: 0 } })).rejects.toThrow('Focus')
    await expect(service.finishSession(session.id, { ...none, reflection: { focus: 5, understanding: 5, completionPct: 0 }, taskBreakdown: [{ taskId: 'missing', seconds: 60 }] })).rejects.toThrow('not found')
    await expect(service.finishSession(session.id, { ...none, reflection: { focus: 5, understanding: 5, completionPct: 0 }, taskBreakdown: [{ taskId: 'x', seconds: -1 }] })).rejects.toThrow('zero or more')
    expect((await service.getSession(session.id))!.endedAtISO).toBeUndefined()
  })
  it('migrates v1 single-task sessions into a task breakdown', async () => {
    const name = `migrate-${crypto.randomUUID()}`
    const { default: Dexie } = await import('dexie')
    const v1 = new Dexie(name)
    v1.version(1).stores({ tasks: '&id, status, deadlineISO, subject', sessions: '&id, taskId, subject, startedAtISO, isDemoHistory', settings: '&key' })
    await v1.table('sessions').add({ id: 's1', taskId: 't1', taskTitle: 'Old task', subject: 'Math', startedAtISO: '2026-09-01T09:00:00Z', durationSec: 600, cameraEvents: [], activitySegments: [] })
    v1.close()
    const migrated = new MorrowLabDB(name)
    expect(await migrated.sessions.get('s1')).toEqual({ id: 's1', subject: 'Math', startedAtISO: '2026-09-01T09:00:00Z', durationSec: 600, cameraEvents: [], activitySegments: [],
      taskBreakdown: [{ taskId: 't1', taskTitle: 'Old task', subject: 'Math', seconds: 600 }] })
    await migrated.delete()
  })
  it('loads exactly three demo tasks and seven histories, once, and resets all tables', async () => {
    await service.loadDemoWorkspace()
    await service.loadDemoWorkspace()
    expect(await service.listTasks()).toHaveLength(3)
    expect(await service.getRecentSessions()).toHaveLength(7)
    expect((await service.getRecentSessions()).every(s => s.isDemoHistory)).toBe(true)
    expect((await service.getInsights()).length).toBeGreaterThanOrEqual(2)
    expect(await service.getTomorrowRecommendations()).toHaveLength(3)
    await service.resetWorkspace()
    expect(await service.listTasks()).toEqual([])
    expect(await service.getRecentSessions()).toEqual([])
    expect(await db.settings.count()).toBe(0)
    await service.loadDemoWorkspace()
    expect(await service.listTasks()).toHaveLength(3)
  })
  it('preserves real tasks when demo data is loaded', async () => {
    const task = await service.createTask(input)
    await service.loadDemoWorkspace()
    expect(await service.listTasks()).toHaveLength(4)
    expect(await service.getTask(task.id)).toEqual(task)
  })
  it('automatically includes newly finished sessions in insights and recommendation scores', async () => {
    await service.loadDemoWorkspace()
    const task = (await service.listTasks()).find(t => t.subject === 'Math')!
    const before = (await service.getTomorrowRecommendations()).find(r => r.taskId === task.id)!
    const session = await service.startSession()
    clock = new Date(clock.getTime() + 1_800_000)
    await service.finishSession(session.id, { ...none, reflection: { focus: 1, understanding: 1, completionPct: 0 }, taskBreakdown: [{ taskId: task.id, seconds: 1800 }] })
    const after = (await service.getTomorrowRecommendations()).find(r => r.taskId === task.id)!
    expect(after.recommendationScore).not.toBe(before.recommendationScore)
    expect((await service.getInsights())[0]).toContain('8 recent completed sessions')
    expect((await service.getRecentSessions())[0].id).toBe(session.id)
    expect((await service.getTask(task.id))!.status).toBe('todo')
  })
})
