// Shared contracts between ui / data-engine / sensors.
// Changing these affects every branch: coordinate before editing.

export type Subject = string;

export interface Task {
  id?: number;
  title: string;
  subject: Subject;
  estimatedMinutes: number;
  deadline?: string; // ISO date
  priority: 1 | 2 | 3;
  done: boolean;
  createdAt: string;
}

export interface StudySession {
  id?: number;
  taskId?: number;
  subject: Subject;
  goal: string;
  startedAt: string;
  endedAt?: string;
}

/** Observable behavior classes (PRD §04-A). */
export type BehaviorEvent = 'studying' | 'phone_usage' | 'away';

/** Only aggregated events are stored, never raw frames (PRD §05). */
export interface SensorEvent {
  id?: number;
  sessionId: number;
  event: BehaviorEvent | 'tab_hidden' | 'tab_visible';
  start: string; // ISO timestamp
  durationSec: number;
  confidence?: number;
}

export interface Reflection {
  id?: number;
  sessionId: number;
  focus: 1 | 2 | 3 | 4 | 5;
  understanding: 1 | 2 | 3 | 4 | 5;
  goalCompletion: number; // 0-100
  createdAt: string;
}
