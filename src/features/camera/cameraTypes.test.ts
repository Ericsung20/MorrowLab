import { describe, expect, it } from 'vitest';
import { FocusClassifier, facePose, type FaceObservation, type FrameObservation } from './cameraTypes';

const face = (yaw = 5, pitch = 10, jawOpen = 0, width = 0.3): FaceObservation => ({ yaw, pitch, jawOpen, width });
const frame = (patch: Partial<FrameObservation> = {}): FrameObservation => ({ phone: 0, people: 1, faces: [face()], ...patch });
/** Calibrates at yaw 5° / pitch 10° (looking at the screen), then returns a classifier at t = 3000. */
function calibrated() {
  const c = new FocusClassifier();
  for (let t = 0; t < 3000; t += 500) c.classify(frame(), t);
  return c;
}

describe('FocusClassifier', () => {
  it('counts looking at the screen or down at paper/tablet as studying', () => {
    const c = calibrated();
    expect(c.classify(frame(), 3000)).toMatchObject({ state: 'studying', pose: { yaw: 0, pitch: 0 } });
    expect(c.classify(frame({ faces: [face(5, 45)] }), 3500).state).toBe('studying');
    // Face hidden but body visible: head far down while writing.
    expect(c.classify(frame({ faces: [] }), 4000)).toMatchObject({ state: 'studying', confidence: 0.6 });
  });
  it('flags looking sideways or up as distracted, relative to the calibrated pose', () => {
    const c = calibrated();
    expect(c.classify(frame({ faces: [face(35)] }), 3000).state).toBe('distracted');
    expect(c.classify(frame({ faces: [face(-25)] }), 3500).state).toBe('distracted');
    const up = calibrated();
    expect(up.classify(frame({ faces: [face(5, -15)] }), 4000).state).toBe('distracted');
    // A camera mounted to the side: an offset baseline is "straight ahead".
    const side = new FocusClassifier();
    for (let t = 0; t < 3000; t += 500) side.classify(frame({ faces: [face(30)] }), t);
    expect(side.classify(frame({ faces: [face(30)] }), 3000).state).toBe('studying');
  });
  it('does not flicker at the threshold and stays distracted when a turned face is lost', () => {
    const c = calibrated();
    expect(c.classify(frame({ faces: [face(35)] }), 3000).state).toBe('distracted');
    expect(c.classify(frame({ faces: [face(27)] }), 3500).state).toBe('distracted'); // below 25° + 5°, above release (17.5°)
    expect(c.classify(frame({ faces: [] }), 4000)).toMatchObject({ state: 'distracted', confidence: 0.6 });
    expect(c.classify(frame({ faces: [face(10)] }), 4500).state).toBe('studying');
    expect(c.classify(frame({ faces: [face(25)] }), 5000).state).toBe('studying'); // 20° from baseline: under the threshold
  });
  it('ignores a phone lying on the desk but catches one being looked at, and holds it through flicker', () => {
    const c = calibrated();
    expect(c.classify(frame({ phone: 0.8 }), 3000).state).toBe('studying');
    expect(c.classify(frame({ phone: 0.35, faces: [face(5, 30)] }), 3500).state).toBe('phone');
    // Partly visible phone drops out of detection for a moment: still phone.
    expect(c.classify(frame({ phone: 0.05, faces: [face(5, 30)] }), 5000).state).toBe('phone');
    expect(c.classify(frame({ phone: 0, faces: [face(5, 30)] }), 6000).state).toBe('studying');
    expect(c.classify(frame({ phone: 0.4, faces: [] }), 7000).state).toBe('phone');
  });
  it('detects absence and chatting with someone', () => {
    const c = calibrated();
    expect(c.classify(frame({ faces: [], people: 0 }), 3000)).toMatchObject({ state: 'away', confidence: 0.7 });
    expect(c.classify(frame({ faces: [face(40), face(0, 10, 0, 0.2)], people: 2 }), 3500).state).toBe('talking');
    const d = calibrated();
    const states = [0, 0.4, 0.05, 0.5, 0.1].map((jaw, i) => d.classify(frame({ faces: [face(5, 10, jaw), face(0, 10, 0, 0.2)], people: 2 }), 3000 + i * 500).state);
    expect(states.at(-1)).toBe('talking');
    // Mouth moving alone (reading aloud) is still studying.
    const e = calibrated();
    const alone = [0, 0.4, 0.05, 0.5, 0.1].map((jaw, i) => e.classify(frame({ faces: [face(5, 10, jaw)] }), 3000 + i * 500).state);
    expect(alone.at(-1)).toBe('studying');
  });
});

describe('facePose', () => {
  /** A face at the given true yaw/pitch (degrees): cheeks 0.2 apart, forehead-chin 0.3 of the frame height. */
  const landmarks = (yaw: number, pitch: number) => {
    const lm = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const r = (d: number) => (d * Math.PI) / 180;
    lm[234] = { x: 0.5 - 0.1 * Math.cos(r(yaw)), y: 0.5, z: -0.1 * Math.sin(r(yaw)) };
    lm[454] = { x: 0.5 + 0.1 * Math.cos(r(yaw)), y: 0.5, z: 0.1 * Math.sin(r(yaw)) };
    const half = 0.15 * 0.75; // 0.15 of a 3:4 frame's height, in x-units
    lm[10] = { x: 0.5, y: 0.5 - 0.15 * Math.cos(r(pitch)), z: -half * Math.sin(r(pitch)) };
    lm[152] = { x: 0.5, y: 0.5 + 0.15 * Math.cos(r(pitch)), z: half * Math.sin(r(pitch)) };
    return lm;
  };
  it('recovers yaw and pitch in degrees from landmark depth', () => {
    expect(facePose(landmarks(0, 0)).yaw).toBeCloseTo(0);
    expect(Math.abs(facePose(landmarks(30, 0)).yaw)).toBeCloseTo(30);
    expect(facePose(landmarks(0, 20)).pitch).toBeCloseTo(20); // chin farther than forehead: looking down
    expect(facePose(landmarks(0, -20)).pitch).toBeCloseTo(-20);
    expect(facePose(landmarks(0, 0), [{ categoryName: 'jawOpen', score: 0.4 }]).jawOpen).toBe(0.4);
  });
});
