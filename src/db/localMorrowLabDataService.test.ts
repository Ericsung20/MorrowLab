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
    const session = await service.startSession(task.id)
    expect(session).toMatchObject({ taskId: task.id, taskTitle: task.title, durationSec: 0, cameraEvents: [], activitySegments: [] })
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
  it('returns undefined on missing reads and useful errors for missing starts/finishes', async () => {
    expect(await service.getTask('missing')).toBeUndefined()
    expect(await service.getSession('missing')).toBeUndefined()
    await expect(service.startSession('missing')).rejects.toThrow('not found')
    await expect(service.finishSession('missing', { cameraEvents: [], activitySegments: [], reflection: { focus: 5, understanding: 5, completionPct: 100 } })).rejects.toThrow('not found')
  })
  it('finishes and scores a session, stores its inputs, and completes its task', async () => {
    const task = await service.createTask(input)
    const started = await service.startSession(task.id)
    clock = new Date(clock.getTime() + 600_000)
    const finished = await service.finishSession(started.id, { cameraEvents: [], activitySegments: [], reflection: { focus: 5, understanding: 5, completionPct: 100, note: 'Done' } })
    expect(finished.durationSec).toBe(600)
    expect(finished.score).toBe(100)
    expect(await service.getSession(started.id)).toEqual(finished)
    expect((await service.getTask(task.id))!.status).toBe('done')
    expect(await service.getTomorrowRecommendations()).toEqual([])
    await expect(service.finishSession(started.id, { cameraEvents: [], activitySegments: [], reflection: { focus: 1, understanding: 1, completionPct: 0 } })).rejects.toThrow('already')
  })
  it('rejects invalid reflections without finishing the session', async () => {
    const task = await service.createTask(input)
    const session = await service.startSession(task.id)
    await expect(service.finishSession(session.id, { cameraEvents: [], activitySegments: [], reflection: { focus: 6, understanding: 5, completionPct: 0 } })).rejects.toThrow('Focus')
    expect((await service.getSession(session.id))!.endedAtISO).toBeUndefined()
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
    const session = await service.startSession(task.id)
    clock = new Date(clock.getTime() + 1_800_000)
    await service.finishSession(session.id, { cameraEvents: [], activitySegments: [], reflection: { focus: 1, understanding: 1, completionPct: 0 } })
    const after = (await service.getTomorrowRecommendations()).find(r => r.taskId === task.id)!
    expect(after.recommendationScore).not.toBe(before.recommendationScore)
    expect((await service.getInsights())[0]).toContain('8 recent completed sessions')
    expect((await service.getRecentSessions())[0].id).toBe(session.id)
    expect((await service.getTask(task.id))!.status).toBe('todo')
  })
})
