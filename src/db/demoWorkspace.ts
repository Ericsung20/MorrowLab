import type { CameraEvent, StudySession, StudyTask } from '../contracts/morrowlab'
import { calculateSessionScore } from '../features/scoring/calculateSessionScore'

export function createDemoWorkspace(now = new Date()): { tasks: StudyTask[]; sessions: StudySession[] } {
  const taskSpecs = [
    { title: 'Calculus Homework', subject: 'Math', estimatedMinutes: 45, days: 1 },
    { title: 'CS Reading', subject: 'Computer Science', estimatedMinutes: 35, days: 2 },
    { title: 'Project Prototype', subject: 'Project', estimatedMinutes: 60, days: 3 },
  ]
  const tasks: StudyTask[] = taskSpecs.map(spec => {
    const deadline = new Date(now)
    deadline.setDate(deadline.getDate() + spec.days)
    deadline.setHours(23, 59, 59, 999)
    return { id: crypto.randomUUID(), title: spec.title, subject: spec.subject, estimatedMinutes: spec.estimatedMinutes,
      deadlineISO: deadline.toISOString(), createdAtISO: now.toISOString(), status: 'todo' }
  })
  const specs = [
    { task: 0, days: 7, hour: 9, minutes: 45, focus: 5, understanding: 4, completion: 100, phone: 60, away: 0 },
    { task: 0, days: 6, hour: 10, minutes: 40, focus: 4, understanding: 5, completion: 85, phone: 180, away: 120 },
    { task: 0, days: 5, hour: 9, minutes: 50, focus: 5, understanding: 4, completion: 90, phone: 60, away: 0 },
    { task: 0, days: 4, hour: 20, minutes: 40, focus: 3, understanding: 3, completion: 95, phone: 480, away: 240 },
    { task: 1, days: 3, hour: 13, minutes: 35, focus: 4, understanding: 4, completion: 100, phone: 60, away: 45 },
    { task: 1, days: 2, hour: 15, minutes: 40, focus: 4, understanding: 4, completion: 80, phone: 60, away: 60 },
    { task: 2, days: 1, hour: 19, minutes: 60, focus: 4, understanding: 4, completion: 70, phone: 360, away: 180 },
  ]
  const sessions = specs.map(spec => {
    const task = tasks[spec.task]
    const start = new Date(now)
    start.setDate(start.getDate() - spec.days)
    start.setHours(spec.hour, 0, 0, 0)
    const durationSec = spec.minutes * 60
    const end = new Date(start.getTime() + durationSec * 1000)
    let cursor = start.getTime()
    const cameraEvents: CameraEvent[] = []
    for (const [type, seconds] of [['studying', durationSec - spec.phone - spec.away], ['phone', spec.phone], ['away', spec.away]] as const) {
      if (!seconds) continue
      cameraEvents.push({ id: crypto.randomUUID(), type, startISO: new Date(cursor).toISOString(),
        endISO: new Date(cursor + seconds * 1000).toISOString(), durationSec: seconds, confidence: 0.92, source: 'model' })
      cursor += seconds * 1000
    }
    const session: StudySession = { id: crypto.randomUUID(), subject: task.subject,
      taskBreakdown: [{ taskId: task.id, taskTitle: task.title, subject: task.subject, seconds: durationSec - spec.phone - spec.away }],
      startedAtISO: start.toISOString(), endedAtISO: end.toISOString(), durationSec, cameraEvents,
      activitySegments: [{ id: crypto.randomUUID(), label: `${task.subject} study materials`, startISO: start.toISOString(), endISO: end.toISOString(), durationSec, source: 'demo' }],
      reflection: { focus: spec.focus, understanding: spec.understanding, completionPct: spec.completion }, isDemoHistory: true }
    session.score = calculateSessionScore(session)
    return session
  })
  return { tasks, sessions }
}
