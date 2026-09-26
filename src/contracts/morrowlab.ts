export type CameraEventType = 'studying' | 'phone' | 'away';

export interface CameraEvent {
  id: string;
  type: CameraEventType;
  startISO: string;
  endISO: string;
  durationSec: number;
  confidence: number;
  source: 'model' | 'manual';
}

export interface ActivitySegment {
  id: string;
  label: string;
  startISO: string;
  endISO: string;
  durationSec: number;
  source: 'browser' | 'demo';
}
