import { describe, expect, it } from 'vitest';
import { EventSmoother } from './eventSmoother';
import type { CameraEventType } from '../../contracts/morrowlab';

describe('EventSmoother', () => {
  const push = (s: EventSmoother, state: CameraEventType, timestamp: number, confidence = 0.8) => s.push({ state, timestamp, confidence });
  const establish = (s: EventSmoother, state: CameraEventType, start = 0) => [0, 1000, 2000].forEach(t => push(s, state, start + t));
  it('rejects one-frame phone spikes', () => {
    const s = new EventSmoother(); establish(s, 'studying');
    push(s, 'phone', 3000); push(s, 'studying', 4000);
    expect(s.currentState).toBe('studying');
    expect(s.flush(5000)).toMatchObject([{ type: 'studying', durationSec: 5 }]);
  });
  it.each([['studying', 'phone'], ['studying', 'away'], ['away', 'studying']] as const)('confirms %s to %s on third sample', (from, to) => {
    const s = new EventSmoother(); establish(s, from);
    expect(push(s, to, 3000)).toEqual([]);
    expect(push(s, to, 4000)).toEqual([]);
    expect(push(s, to, 5000)).toMatchObject([{ type: from, durationSec: 3, endISO: new Date(3000).toISOString() }]);
    expect(s.currentState).toBe(to);
    expect(s.flush(6000)).toMatchObject([{ type: to, durationSec: 3 }]);
    expect(s.flush(7000)).toEqual([]);
  });
  it('averages supporting confidence and excludes rejected samples', () => {
    const s = new EventSmoother();
    push(s, 'studying', 0, 0.6); push(s, 'studying', 1000, 0.7); push(s, 'studying', 2000, 0.8);
    push(s, 'phone', 3000, 0.4);
    expect(s.flush(4000)[0].confidence).toBeCloseTo(0.7);
  });
  it('discards unconfirmed/zero-length events and ignores out-of-order observations', () => {
    const s = new EventSmoother(); push(s, 'phone', 1000); expect(s.flush(1000)).toEqual([]);
    establish(s, 'studying'); push(s, 'phone', 500);
    expect(s.currentState).toBe('studying');
  });
  it('confirms quick phone glances sooner than looking away', () => {
    const s = new EventSmoother({ studying: 3, phone: 2, away: 4, distracted: 10, talking: 6 }); establish(s, 'studying');
    push(s, 'phone', 3000); expect(s.currentState).toBe('studying');
    push(s, 'phone', 3500); expect(s.currentState).toBe('phone');
    establish(s, 'studying', 4000);
    for (let t = 7000; t < 11500; t += 500) push(s, 'distracted', t);
    expect(s.currentState).toBe('studying');
    push(s, 'distracted', 11500); expect(s.currentState).toBe('distracted');
  });
});
