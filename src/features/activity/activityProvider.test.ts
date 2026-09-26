import { afterEach, expect, it, vi } from 'vitest';
import { ActivityTimeline, BrowserActivityProvider, DemoActivityProvider } from './activityProvider';
import { ACTIVITY_LABELS } from '../../contracts/activity';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('closes transitions, ignores duplicate labels, and snapshots without duplication', () => {
  let now = 0;
  const timeline = new ActivityTimeline('browser', () => now);
  timeline.transition('MorrowLab active'); now = 2000;
  timeline.transition('MorrowLab active');
  expect(timeline.getSegments()[0].durationSec).toBe(2);
  timeline.transition('Other tab/window'); now = 5000;
  expect(timeline.stop().map(s => s.durationSec)).toEqual([2, 3]);
  expect(timeline.stop()).toHaveLength(2);
});
it('tracks visibility/focus and removes listeners on stop', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const p = new BrowserActivityProvider(); p.start(); p.start();
  vi.advanceTimersByTime(1000); window.dispatchEvent(new Event('blur'));
  vi.advanceTimersByTime(1000); visibility.mockReturnValue('hidden'); window.dispatchEvent(new Event('focus'));
  vi.advanceTimersByTime(1000); visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(1000);
  const result = p.stop();
  expect(result.map(s => s.label)).toEqual(['MorrowLab active', 'Other tab/window', 'MorrowLab active']);
  expect(result.map(s => s.durationSec)).toEqual([1, 2, 1]);
  window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(1000);
  expect(p.getSegments()).toEqual(result);
});
it('marks synthetic activity as demo and stops its timer', () => {
  vi.useFakeTimers();
  const p = new DemoActivityProvider(); p.start(); vi.advanceTimersByTime(16000);
  expect(p.stop().map(s => [s.label, s.source])).toEqual([['VS Code', 'demo'], ['Chrome', 'demo']]);
  expect(vi.getTimerCount()).toBe(0);
});

it('changes study purpose prospectively and preserves previous off-task time', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const p = new BrowserActivityProvider(); p.start();
  vi.advanceTimersByTime(1000); p.setStudyMode('research');
  vi.advanceTimersByTime(2000); p.setStudyMode('lecture');
  vi.advanceTimersByTime(3000); p.setStudyMode('strict');
  vi.advanceTimersByTime(1000);
  const result = p.stop();
  expect(result.map(s => [s.label, s.durationSec])).toEqual([
    [ACTIVITY_LABELS.other, 1], [ACTIVITY_LABELS.research, 2], [ACTIVITY_LABELS.lecture, 3], [ACTIVITY_LABELS.other, 1],
  ]);
  p.setStudyMode('research'); vi.advanceTimersByTime(1000);
  expect(p.getSegments()).toEqual(result);
});
