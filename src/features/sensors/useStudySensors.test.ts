import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { studySecondsOnTask, useStudySensors, withScreenDistraction } from './useStudySensors';
import type { ActivitySegment, CameraEvent } from '../../contracts/morrowlab';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('keeps timers, activity and manual events usable without camera and truncates on stop', async () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const { result, unmount } = renderHook(() => useStudySensors({ current: null }));
  await act(() => result.current.start());
  expect(result.current.status).toBe('error');
  act(() => result.current.simulatePhone());
  act(() => vi.advanceTimersByTime(5000));
  expect(result.current.phoneEventCount).toBe(1);
  act(() => result.current.simulateAway());
  act(() => vi.advanceTimersByTime(2000));
  let stopped: ReturnType<typeof result.current.stop>;
  act(() => { stopped = result.current.stop(); });
  expect(stopped!.cameraEvents.map(e => [e.type, e.durationSec, e.source])).toEqual([['phone', 5, 'manual'], ['away', 2, 'manual']]);
  expect(result.current.elapsedSeconds).toBe(7);
  expect(stopped!.activitySegments.length).toBeGreaterThan(0);
  expect(vi.getTimerCount()).toBe(0);
  unmount();
});
it('cleans timers on unmount and resets events on restart', async () => {
  vi.useFakeTimers();
  const ref = { current: null };
  const { result, unmount } = renderHook(() => useStudySensors(ref, { demoActivity: true }));
  await act(() => result.current.start());
  act(() => result.current.simulatePhone()); act(() => vi.advanceTimersByTime(1000));
  act(() => { result.current.stop(); });
  await act(() => result.current.start());
  expect(result.current.cameraEvents).toEqual([]);
  unmount(); expect(vi.getTimerCount()).toBe(0);
});

it('does not count camera study time spent on a distracting screen', () => {
  const at = (s: number) => new Date(s * 1000).toISOString();
  const studying: CameraEvent = { id: 'c', type: 'studying', startISO: at(0), endISO: at(100), durationSec: 100, confidence: 0.9, source: 'model' };
  const seg = (from: number, to: number, category: ActivitySegment['category']): ActivitySegment =>
    ({ id: `${from}`, label: 'x', startISO: at(from), endISO: at(to), durationSec: to - from, source: 'browser', category });
  expect(studySecondsOnTask([studying], [seg(0, 30, 'study'), seg(30, 70, 'distraction'), seg(70, 100, 'neutral')])).toBe(60);
  expect(studySecondsOnTask([studying, { ...studying, id: 'p', type: 'phone' }], [])).toBe(100);
});

it('shows distracting screen time inside studying as its own timeline type', () => {
  const at = (s: number) => new Date(s * 1000).toISOString();
  const cam = (type: CameraEvent['type'], from: number, to: number): CameraEvent =>
    ({ id: type, type, startISO: at(from), endISO: at(to), durationSec: to - from, confidence: 0.9, source: 'model' });
  const seg = (from: number, to: number, category: ActivitySegment['category']): ActivitySegment =>
    ({ id: `${from}`, label: 'x', startISO: at(from), endISO: at(to), durationSec: to - from, source: 'browser', category });
  const timeline = withScreenDistraction([cam('studying', 0, 100), cam('phone', 100, 120)], [seg(20, 40, 'distraction'), seg(60, 110, 'distraction')]);
  expect(timeline.map(e => [e.type, e.durationSec])).toEqual([
    ['studying', 20], ['screen', 20], ['studying', 20], ['screen', 40], ['phone', 20],
  ]);
  expect(new Set(timeline.map(e => e.id)).size).toBe(timeline.length);
});
