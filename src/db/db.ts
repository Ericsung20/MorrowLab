import Dexie, { type Table } from 'dexie'
import type { StudySession, StudyTask } from '../contracts/morrowlab'

export interface WorkspaceSetting { key: string; value: unknown }

export class MorrowLabDB extends Dexie {
  tasks!: Table<StudyTask, string>
  sessions!: Table<StudySession, string>
  settings!: Table<WorkspaceSetting, string>

  constructor(name = 'MorrowLabDB') {
    super(name)
    this.version(1).stores({
      tasks: '&id, status, deadlineISO, subject',
      sessions: '&id, taskId, subject, startedAtISO, isDemoHistory',
      settings: '&key',
    })
    // v2: sessions cover all tasks; the old single task becomes a one-entry breakdown.
    this.version(2).stores({ sessions: '&id, subject, startedAtISO, isDemoHistory' }).upgrade(tx =>
      tx.table('sessions').toCollection().modify((s: StudySession & { taskId?: string; taskTitle?: string }) => {
        s.taskBreakdown ??= s.taskId ? [{ taskId: s.taskId, taskTitle: s.taskTitle ?? '', subject: s.subject, seconds: s.durationSec }] : []
        delete s.taskId
        delete s.taskTitle
      }))
  }
}

export const db = new MorrowLabDB()
