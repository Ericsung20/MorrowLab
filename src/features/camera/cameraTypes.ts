import type { CameraEventType } from '../../contracts/morrowlab';

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface CameraSample {
  state: CameraEventType;
  confidence: number;
  /** Unix epoch milliseconds. */
  timestamp: number;
}
export interface Detection { class: string; score: number }
export const PERSON_THRESHOLD = 0.55;
export const PHONE_THRESHOLD = 0.35;
export const INFERENCE_INTERVAL_MS = 850;

export function deriveSample(detections: Detection[], timestamp: number): CameraSample {
  const phone = Math.max(0, ...detections.filter(d => d.class === 'cell phone').map(d => d.score));
  const person = Math.max(0, ...detections.filter(d => d.class === 'person').map(d => d.score));
  if (phone >= PHONE_THRESHOLD) return { state: 'phone', confidence: phone, timestamp };
  if (person >= PERSON_THRESHOLD) return { state: 'studying', confidence: person, timestamp };
  // Heuristic absence confidence, not an ML class probability.
  return { state: 'away', confidence: 0.7, timestamp };
}
