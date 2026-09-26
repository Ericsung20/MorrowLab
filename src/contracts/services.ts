import type {
  StudyTask,
  StudySession,
  CameraEvent,
  ActivitySegment,
  SessionReflection,
  StudyRecommendation,
  CameraEventType,
} from "./morrowlab";
export interface MorrowLabDataService {
  listTasks(): Promise<StudyTask[]>;
  createTask(input: {
    title: string;
    subject: string;
    estimatedMinutes: number;
    deadlineISO: string;
  }): Promise<StudyTask>;
  getTask(id: string): Promise<StudyTask | undefined>;
  startSession(taskId: string): Promise<StudySession>;
  finishSession(
    sessionId: string,
    input: {
      cameraEvents: CameraEvent[];
      activitySegments: ActivitySegment[];
      reflection: SessionReflection;
    },
  ): Promise<StudySession>;
  getSession(id: string): Promise<StudySession | undefined>;
  getRecentSessions(): Promise<StudySession[]>;
  getInsights(): Promise<string[]>;
  getTomorrowRecommendations(): Promise<StudyRecommendation[]>;
  loadDemoWorkspace(): Promise<void>;
  resetWorkspace(): Promise<void>;
}
export interface SensorLiveState {
  status: "idle" | "loading" | "running" | "error";
  currentState?: CameraEventType;
  confidence?: number;
  studySeconds: number;
  phoneEventCount: number;
  awayEventCount: number;
  cameraEvents: CameraEvent[];
  activitySegments: ActivitySegment[];
  error?: string;
}
export interface StudySensorController {
  start(): Promise<void>;
  stop(): Promise<{
    cameraEvents: CameraEvent[];
    activitySegments: ActivitySegment[];
  }>;
  simulatePhone(durationSec?: number): void;
  simulateAway(durationSec?: number): void;
}
// Adapter contract: the real hook may attach its local video stream to videoRef.
export interface StudySensorBinding {
  state: SensorLiveState;
  controller: StudySensorController;
  videoRef: import("react").RefObject<HTMLVideoElement | null>;
  isMock: boolean;
}
