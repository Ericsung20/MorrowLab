export interface StudyTask {
  id: string;
  title: string;
  subject: string;
  estimatedMinutes: number;
  deadlineISO: string;
  createdAtISO: string;
  status: "todo" | "done";
}
export type CameraEventType = "studying" | "phone" | "away";
export interface CameraEvent {
  id: string;
  type: CameraEventType;
  startISO: string;
  endISO: string;
  durationSec: number;
  confidence: number;
  source: "model" | "manual";
}
export interface ActivitySegment {
  id: string;
  label: string;
  startISO: string;
  endISO: string;
  durationSec: number;
  source: "browser" | "demo";
}
export interface SessionReflection {
  focus: number;
  understanding: number;
  completionPct: number;
  note?: string;
}
export interface StudySession {
  id: string;
  taskId: string;
  taskTitle: string;
  subject: string;
  startedAtISO: string;
  endedAtISO?: string;
  durationSec: number;
  cameraEvents: CameraEvent[];
  activitySegments: ActivitySegment[];
  reflection?: SessionReflection;
  score?: number;
  isDemoHistory?: boolean;
}
export interface StudyRecommendation {
  taskId: string;
  taskTitle: string;
  subject: string;
  dateISO: string;
  startTime: string;
  estimatedMinutes: number;
  recommendationScore: number;
  reasons: string[];
}
