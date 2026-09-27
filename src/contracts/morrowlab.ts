export interface StudyTask {
  id: string
  title: string
  subject: string
  estimatedMinutes: number
  deadlineISO: string
  createdAtISO: string
  status: 'todo' | 'done'
}

/** studying includes looking down at paper/tablet; distracted = looking elsewhere; talking = chatting with someone. */
export type CameraEventType = 'studying' | 'phone' | 'away' | 'distracted' | 'talking'

export interface CameraEvent {
  id: string
  type: CameraEventType
  startISO: string
  endISO: string
  durationSec: number
  confidence: number
  source: 'model' | 'manual'
}

export type ActivityCategory = 'study' | 'distraction' | 'neutral'

export interface ActivitySegment {
  id: string
  label: string
  startISO: string
  endISO: string
  durationSec: number
  source: 'browser' | 'demo'
  /** Absent on sessions recorded before tab classification existed. */
  category?: ActivityCategory
  /** Hostname only; full URLs are never stored. */
  host?: string
  /** Task this screen time was matched to, if any. */
  taskId?: string
}

export interface SessionReflection {
  focus: number
  understanding: number
  completionPct: number
  note?: string
}

export interface TaskTime {
  taskId: string
  taskTitle: string
  subject: string
  seconds: number
}

/** One session covers the whole study period; time per task is estimated, then confirmed at reflection. */
export interface StudySession {
  id: string
  /** Subject with the most time in taskBreakdown, or 'General'. */
  subject: string
  startedAtISO: string
  endedAtISO?: string
  durationSec: number
  cameraEvents: CameraEvent[]
  activitySegments: ActivitySegment[]
  taskBreakdown: TaskTime[]
  reflection?: SessionReflection
  score?: number
  isDemoHistory?: boolean
}

export interface StudyRecommendation {
  taskId: string
  taskTitle: string
  subject: string
  dateISO: string
  startTime: string
  estimatedMinutes: number
  recommendationScore: number
  reasons: string[]
}
