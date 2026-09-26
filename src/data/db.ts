import Dexie, { type EntityTable } from 'dexie';
import type { Reflection, SensorEvent, StudySession, Task } from '../shared/types';

// Local-first storage (IndexedDB). Owned by feature/data-engine.
// Bump the version number when changing the schema.
export const db = new Dexie('morrowlab') as Dexie & {
  tasks: EntityTable<Task, 'id'>;
  sessions: EntityTable<StudySession, 'id'>;
  events: EntityTable<SensorEvent, 'id'>;
  reflections: EntityTable<Reflection, 'id'>;
};

db.version(1).stores({
  tasks: '++id, subject, deadline, done',
  sessions: '++id, taskId, subject, startedAt',
  events: '++id, sessionId, event, start',
  reflections: '++id, sessionId',
});
