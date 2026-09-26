import type { ActivitySegment, CameraEvent, SessionReflection, StudyRecommendation, StudySession, StudyTask } from './morrowlab'

export interface MorrowLabDataService {
  listTasks(): Promise<StudyTask[]>
  createTask(input: {
    title: string
    subject: string
    estimatedMinutes: number
    deadlineISO: string
  }): Promise<StudyTask>
  getTask(id: string): Promise<StudyTask | undefined>
  startSession(taskId: string): Promise<StudySession>
  finishSession(sessionId: string, input: {
    cameraEvents: CameraEvent[]
    activitySegments: ActivitySegment[]
    reflection: SessionReflection
  }): Promise<StudySession>
  getSession(id: string): Promise<StudySession | undefined>
  getRecentSessions(): Promise<StudySession[]>
  getInsights(): Promise<string[]>
  getTomorrowRecommendations(): Promise<StudyRecommendation[]>
  loadDemoWorkspace(): Promise<void>
  resetWorkspace(): Promise<void>
}
