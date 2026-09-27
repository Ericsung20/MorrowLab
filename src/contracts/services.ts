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
  startSession(): Promise<StudySession>;
  finishSession(
    sessionId: string,
    input: {
      cameraEvents: CameraEvent[];
      activitySegments: ActivitySegment[];
      reflection: SessionReflection;
      /** Confirmed seconds per task; titles/subjects are filled in by the service. */
      taskBreakdown: { taskId: string; seconds: number }[];
      completedTaskIds: string[];
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
  /** distracted + talking events */
  offTaskEventCount: number;
  cameraEvents: CameraEvent[];
  activitySegments: ActivitySegment[];
  /** True when the MorrowLab browser extension reports the active tab. */
  extensionConnected: boolean;
  /** True when the desktop companion (npm run companion) reports the foreground app. */
  companionConnected: boolean;
  /** The screen in front right now is a distracting site/app. */
  screenDistracted: boolean;
  /** Live head angle in degrees relative to the calibrated screen pose (+pitch = looking down). */
  headPose?: { yaw: number; pitch: number } | null;
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
