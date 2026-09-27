import type { CameraEventType } from '../../contracts/morrowlab';

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface CameraSample {
  state: CameraEventType;
  confidence: number;
  /** Unix epoch milliseconds. */
  timestamp: number;
  /** Head angle in degrees relative to the calibrated screen pose, when a face is visible (for display/tuning). */
  pose?: { yaw: number; pitch: number };
}

/** Head pose in degrees. yaw: turning sideways (either sign); pitch: + = looking down. */
export interface FaceObservation { yaw: number; pitch: number; jawOpen: number; width: number }
export interface FrameObservation { phone: number; people: number; faces: FaceObservation[] }

export const INFERENCE_INTERVAL_MS = 500;
export const PERSON_THRESHOLD = 0.5;
/**
 * Calibration knobs (angles in degrees). Pose is relative to the student's own pose over the first
 * samples (assumed to be looking at the screen), so it adapts to camera placement. The session page
 * shows the live angles, which is the easiest way to tune these.
 */
export const FOCUS_TUNING = {
  phoneThreshold: 0.3,
  /** A partly visible phone flickers in and out; keep the phone state this long after the last hit. */
  phoneHoldMs: 2000,
  yawAway: 25,
  pitchUp: -18,
  pitchDown: 10,
  /** Once turned away, the head must come back within this fraction of the threshold to count as back (stops flicker). */
  release: 0.7,
  talkJawStd: 0.06,
  baselineSamples: 6,
};
/** Samples needed to confirm a state: brief glances or single-frame misses shouldn't create events. */
export const REQUIRED_SAMPLES: Record<CameraEventType, number> = { studying: 3, phone: 2, away: 4, distracted: 8, talking: 6 };

interface Landmark { x: number; y: number; z?: number }
const deg = (rad: number) => (rad * 180) / Math.PI;
/**
 * Uses the landmarks' depth (z, same scale as x, smaller = closer to the camera): turning the head moves one
 * cheek closer than the other; looking down brings the forehead closer than the chin.
 * aspect = video height / width, since y is normalized by height and z by width.
 */
export function facePose(landmarks: Landmark[], blendshapes: { categoryName: string; score: number }[] = [], aspect = 0.75): FaceObservation {
  const left = landmarks[234], right = landmarks[454], forehead = landmarks[10], chin = landmarks[152];
  const z = (l: Landmark) => l.z ?? 0;
  return {
    yaw: deg(Math.atan2(z(right) - z(left), Math.abs(right.x - left.x) || 1e-6)),
    pitch: deg(Math.atan2(z(chin) - z(forehead), Math.abs(chin.y - forehead.y) * aspect || 1e-6)),
    jawOpen: blendshapes.find(c => c.categoryName === 'jawOpen')?.score ?? 0,
    width: Math.abs(right.x - left.x),
  };
}

const std = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

/**
 * Turns per-frame observations into states:
 * - phone: a phone is visible while the student looks down/away (a phone just lying there while they face the screen is ignored)
 * - away: nobody in frame
 * - talking: someone else is present and the student turns to them or keeps moving their mouth
 * - distracted: head turned sideways or looking up, not at the screen or desk
 * - studying: everything else, including looking down at paper/tablet
 */
export class FocusClassifier {
  private calibration: FaceObservation[] = [];
  private baseline: { yaw: number; pitch: number } | null = null;
  private jaw: number[] = [];
  private lastPhone = -Infinity;
  private turned = false;
  private readonly tuning: typeof FOCUS_TUNING;
  constructor(tuning = FOCUS_TUNING) { this.tuning = tuning; }

  classify(obs: FrameObservation, timestamp: number): CameraSample {
    const t = this.tuning;
    const face = obs.faces.reduce<FaceObservation | undefined>((a, f) => (!a || f.width > a.width ? f : a), undefined);
    let pose: CameraSample['pose'];
    if (face) {
      if (!this.baseline) {
        this.calibration.push(face);
        if (this.calibration.length >= t.baselineSamples) {
          const mean = (k: 'yaw' | 'pitch') => this.calibration.reduce((s, f) => s + f[k], 0) / this.calibration.length;
          this.baseline = { yaw: mean('yaw'), pitch: mean('pitch') };
        }
      }
      if (this.baseline) {
        pose = { yaw: face.yaw - this.baseline.yaw, pitch: face.pitch - this.baseline.pitch };
        const k = this.turned ? t.release : 1;
        this.turned = Math.abs(pose.yaw) > t.yawAway * k || pose.pitch < t.pitchUp * k;
      }
      this.jaw = [...this.jaw.slice(-7), face.jawOpen];
    } else this.jaw = [];
    // A face turned far enough is lost by the face model; keep the last known "turned" until it reappears.
    const turned = this.turned;
    const lookingDown = !!pose && pose.pitch > t.pitchDown;
    const sample = (state: CameraEventType, confidence: number): CameraSample => ({ state, confidence, timestamp, ...(pose && { pose }) });
    if (obs.phone >= t.phoneThreshold && (!face || turned || lookingDown)) this.lastPhone = timestamp;
    if (timestamp - this.lastPhone <= t.phoneHoldMs) return sample('phone', Math.max(obs.phone, 0.5));
    if (!face && obs.people === 0) { this.turned = false; return sample('away', 0.7); }
    const othersPresent = obs.faces.length > 1 || obs.people > 1;
    const mouthMoving = this.jaw.length >= 4 && std(this.jaw) > t.talkJawStd;
    if (othersPresent && (turned || mouthMoving)) return sample('talking', 0.7);
    if (turned) return sample('distracted', face ? 0.8 : 0.6);
    // Body visible with the face hidden (and not turned away): usually the head is far down, writing.
    return sample('studying', face ? 0.9 : 0.6);
  }
}
