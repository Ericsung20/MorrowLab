import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStudySensors } from './useStudySensors';
import type { CameraSample, ModelStatus } from '../camera/cameraTypes';

interface Callbacks {
  onSample(sample: CameraSample): void;
  onStatus(status: ModelStatus): void;
  onInterrupted(time: number): void;
}
const mock = vi.hoisted(() => ({ callbacks: null as Callbacks | null }));
vi.mock('../camera/cameraEngine', () => ({ CameraEngine: class {
  constructor(callbacks: Callbacks) { mock.callbacks = callbacks; }
  async start() { mock.callbacks!.onStatus('ready'); }
  stop() {}
} }));
afterEach(() => vi.useRealTimers());

it('excludes camera recovery gaps from saved study events while keeping the session running', async () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const ref = { current: document.createElement('video') };
  const { result, unmount } = renderHook(() => useStudySensors(ref, { demoActivity: true }));
  await act(() => result.current.start());
  const report = (time: number) => act(() => {
    vi.setSystemTime(time);
    mock.callbacks!.onSample({ state: 'studying', confidence: 0.9, timestamp: time });
  });
  report(10000); report(10500); report(11000);
  act(() => {
    vi.setSystemTime(13000);
    mock.callbacks!.onInterrupted(11000);
    mock.callbacks!.onStatus('loading');
  });
  expect(result.current.status).toBe('loading');
  expect(result.current.currentState).toBeNull();
  act(() => { vi.setSystemTime(30000); mock.callbacks!.onStatus('ready'); });
  report(30000); report(30500); report(31000);
  let saved: ReturnType<typeof result.current.stop>;
  act(() => { vi.setSystemTime(32000); saved = result.current.stop(); });
  expect(saved!.cameraEvents.map(event => event.durationSec)).toEqual([1, 2]);
  expect(result.current.elapsedSeconds).toBe(22);
  expect(result.current.studySeconds).toBe(3);
  unmount(); expect(vi.getTimerCount()).toBe(0);
});
