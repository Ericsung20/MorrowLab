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
  }
}

export const db = new MorrowLabDB()
