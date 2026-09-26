import type { MorrowLabDataService } from '../contracts/services'
import type { StudySession, StudyTask } from '../contracts/morrowlab'
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
    async startSession(taskId) {
      return database.transaction('rw', database.tasks, database.sessions, async () => {
        const task = await database.tasks.get(taskId)
        if (!task) throw new Error(`Task "${taskId}" was not found.`)
        const session: StudySession = { id: crypto.randomUUID(), taskId, taskTitle: task.title, subject: task.subject,
          startedAtISO: now().toISOString(), durationSec: 0, cameraEvents: [], activitySegments: [] }
        await database.sessions.add(session)
        return session
      })
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
      return database.transaction('rw', database.sessions, database.tasks, async () => {
        const session = await database.sessions.get(sessionId)
        if (!session) throw new Error(`Session "${sessionId}" was not found.`)
        if (session.endedAtISO) throw new Error(`Session "${sessionId}" has already been completed.`)
        const endedAtISO = now().toISOString()
        const finished: StudySession = { ...session, ...input, endedAtISO,
          durationSec: Math.max(0, (Date.parse(endedAtISO) - Date.parse(session.startedAtISO)) / 1000) }
        finished.score = calculateSessionScore(finished)
        await database.sessions.put(finished)
        if (input.reflection.completionPct === 100) await database.tasks.update(session.taskId, { status: 'done' })
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
