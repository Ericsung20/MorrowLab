import type { MorrowLabDataService } from '../contracts/services'
import type { StudySession, StudyTask, TaskTime } from '../contracts/morrowlab'
import { db, type MorrowLabDB } from '../db/db'
import { createDemoWorkspace } from '../db/demoWorkspace'
import { calculateSessionScore } from '../features/scoring/calculateSessionScore'
import { generateInsights } from '../features/insights/generateInsights'
import { generateTomorrowRecommendations } from '../features/recommendations/recommendationEngine'

function requireRange(value: number, min: number, max: number, name: string) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`)
}

/** Factory permits isolated databases and a deterministic clock in integration tests. */
export function createLocalMorrowLabDataService(database: MorrowLabDB = db, now: () => Date = () => new Date()): MorrowLabDataService {
  const service: MorrowLabDataService = {
    async listTasks() { return database.tasks.orderBy('deadlineISO').toArray() },
    async createTask(input) {
      if (!input.title.trim()) throw new Error('Task title is required.')
      if (!input.subject.trim()) throw new Error('Task subject is required.')
      if (!Number.isFinite(input.estimatedMinutes) || input.estimatedMinutes <= 0) throw new Error('Estimated minutes must be greater than zero.')
      if (!input.deadlineISO.trim() || !Number.isFinite(new Date(input.deadlineISO).getTime())) throw new Error('Task deadline must be a valid date.')
      const task: StudyTask = { ...input, title: input.title.trim(), subject: input.subject.trim(),
        deadlineISO: new Date(input.deadlineISO).toISOString(), id: crypto.randomUUID(), createdAtISO: now().toISOString(), status: 'todo' }
      await database.tasks.add(task)
      return task
    },
    async getTask(id) { return database.tasks.get(id) },
    async startSession() {
      const session: StudySession = { id: crypto.randomUUID(), subject: 'General', startedAtISO: now().toISOString(),
        durationSec: 0, cameraEvents: [], activitySegments: [], taskBreakdown: [] }
      await database.sessions.add(session)
      return session
    },
    async finishSession(sessionId, input) {
      requireRange(input.reflection.focus, 1, 5, 'Focus')
      requireRange(input.reflection.understanding, 1, 5, 'Understanding')
      requireRange(input.reflection.completionPct, 0, 100, 'Completion percentage')
      for (const event of [...input.cameraEvents, ...input.activitySegments]) {
        if (!Number.isFinite(event.durationSec) || event.durationSec < 0 ||
            !Number.isFinite(Date.parse(event.startISO)) || !Number.isFinite(Date.parse(event.endISO)) ||
            Date.parse(event.endISO) < Date.parse(event.startISO)) throw new Error('Session events must have valid dates and non-negative durations.')
      }
      for (const event of input.cameraEvents) {
        requireRange(event.confidence, 0, 1, 'Camera confidence')
      }
      for (const entry of input.taskBreakdown) {
        if (!Number.isFinite(entry.seconds) || entry.seconds < 0) throw new Error('Time per task must be zero or more.')
      }
      return database.transaction('rw', database.sessions, database.tasks, async () => {
        const session = await database.sessions.get(sessionId)
        if (!session) throw new Error(`Session "${sessionId}" was not found.`)
        if (session.endedAtISO) throw new Error(`Session "${sessionId}" has already been completed.`)
        const endedAtISO = now().toISOString()
        const taskBreakdown: TaskTime[] = []
        for (const entry of input.taskBreakdown.filter(e => e.seconds > 0)) {
          const task = await database.tasks.get(entry.taskId)
          if (!task) throw new Error(`Task "${entry.taskId}" was not found.`)
          taskBreakdown.push({ taskId: task.id, taskTitle: task.title, subject: task.subject, seconds: Math.round(entry.seconds) })
        }
        const bySubject = new Map<string, number>()
        for (const t of taskBreakdown) bySubject.set(t.subject, (bySubject.get(t.subject) ?? 0) + t.seconds)
        const subject = [...bySubject].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'General'
        const finished: StudySession = { ...session, cameraEvents: input.cameraEvents, activitySegments: input.activitySegments,
          reflection: input.reflection, taskBreakdown, subject, endedAtISO,
          durationSec: Math.max(0, (Date.parse(endedAtISO) - Date.parse(session.startedAtISO)) / 1000) }
        finished.score = calculateSessionScore(finished)
        await database.sessions.put(finished)
        for (const id of input.completedTaskIds) await database.tasks.update(id, { status: 'done' })
        return finished
      })
    },
    async getSession(id) { return database.sessions.get(id) },
    async getRecentSessions() { return database.sessions.orderBy('startedAtISO').reverse().toArray() },
    async getInsights() { return generateInsights(await service.getRecentSessions()) },
    async getTomorrowRecommendations() {
      return database.transaction('r', database.tasks, database.sessions, async () =>
        generateTomorrowRecommendations(await service.listTasks(), await service.getRecentSessions(), now()))
    },
    async loadDemoWorkspace() {
      // Preserve user data. The marker makes repeated loads idempotent, including across refreshes.
      await database.transaction('rw', database.tasks, database.sessions, database.settings, async () => {
        if (await database.settings.get('demoWorkspaceLoaded')) return
        const demo = createDemoWorkspace(now())
        await database.tasks.bulkAdd(demo.tasks)
        await database.sessions.bulkAdd(demo.sessions)
        await database.settings.put({ key: 'demoWorkspaceLoaded', value: true })
      })
    },
    async resetWorkspace() {
      await database.transaction('rw', database.tasks, database.sessions, database.settings, async () => {
        await database.tasks.clear()
        await database.sessions.clear()
        await database.settings.clear()
      })
    },
  }
  return service
}

export const localMorrowLabDataService: MorrowLabDataService = createLocalMorrowLabDataService()
