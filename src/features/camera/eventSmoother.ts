import type { CameraEvent, CameraEventType } from '../../contracts/morrowlab';
import type { CameraSample } from './cameraTypes';

interface Interval { state: CameraEventType; start: number; sum: number; count: number; id: string }

/** Consecutive observations (per-state count) confirm a state, backdated to its first sample. */
export class EventSmoother {
  private active: Interval | null = null;
  private candidate: Interval | null = null;
  private lastTimestamp = -Infinity;
  private sequence = 0;

  private readonly requiredSamples: number | Record<CameraEventType, number>;
  private readonly minimumDurationMs: number;
  constructor(requiredSamples: number | Record<CameraEventType, number> = 3, minimumDurationMs = 500) {
    this.requiredSamples = requiredSamples;
    this.minimumDurationMs = minimumDurationMs;
  }

  push(sample: CameraSample): CameraEvent[] {
    if (!Number.isFinite(sample.timestamp) || !Number.isFinite(sample.confidence) || sample.timestamp < this.lastTimestamp) return [];
    this.lastTimestamp = sample.timestamp;
    const confidence = Math.max(0, Math.min(1, sample.confidence));
    if (this.active?.state === sample.state) {
      this.candidate = null;
      this.active.sum += confidence;
      this.active.count++;
      return [];
    }
    if (this.candidate?.state !== sample.state) {
      this.candidate = { state: sample.state, start: sample.timestamp, sum: 0, count: 0, id: `camera-${sample.timestamp}-${this.sequence++}` };
    }
    this.candidate.sum += confidence;
    this.candidate.count++;
    const required = typeof this.requiredSamples === 'number' ? this.requiredSamples : this.requiredSamples[sample.state];
    if (this.candidate.count < required) return [];
    const closed = this.snapshot(this.candidate.start);
    this.active = this.candidate;
    this.candidate = null;
    return closed ? [closed] : [];
  }

  snapshot(timestamp: number): CameraEvent | null {
    const a = this.active;
    if (!a || timestamp - a.start < this.minimumDurationMs || timestamp <= a.start) return null;
    return { id: a.id, type: a.state, startISO: new Date(a.start).toISOString(), endISO: new Date(timestamp).toISOString(), durationSec: (timestamp - a.start) / 1000, confidence: a.sum / a.count, source: 'model' };
  }

  get currentState() { return this.active?.state ?? null; }
  get confidence() { return this.active ? this.active.sum / this.active.count : 0; }

  flush(timestamp: number): CameraEvent[] {
    const event = this.snapshot(Math.max(timestamp, this.lastTimestamp));
    this.active = null;
    this.candidate = null;
    this.lastTimestamp = -Infinity;
    return event ? [event] : [];
  }
}
