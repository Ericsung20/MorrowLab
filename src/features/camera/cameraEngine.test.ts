import { afterEach, expect, it, vi } from 'vitest';
import { CameraEngine } from './cameraEngine';

const mocks = vi.hoisted(() => ({ load: vi.fn(), ready: vi.fn() }));
vi.mock('@tensorflow/tfjs', () => ({ ready: mocks.ready }));
vi.mock('@tensorflow-models/coco-ssd', () => ({ load: mocks.load }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); mocks.load.mockReset(); });

it('stops a late permission stream after monitoring has stopped', async () => {
  let resolve!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>(r => { resolve = r; });
  const getUserMedia = vi.fn(() => pending);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const stop = vi.fn(); const error = vi.fn();
  const engine = new CameraEngine({ onSample: vi.fn(), onError: error });
  const starting = engine.start(document.createElement('video'));
  engine.stop(); resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await starting;
  expect(stop).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
  expect(getUserMedia).toHaveBeenCalledWith({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
  vi.unstubAllGlobals();
});

function setupVideo() {
  const video = document.createElement('video');
  vi.spyOn(video, 'play').mockResolvedValue(undefined);
  vi.spyOn(video, 'pause').mockImplementation(() => {});
  Object.defineProperties(video, { readyState: { value: 4 }, videoWidth: { value: 640 } });
  const stop = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), clearRect: vi.fn() } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  return { video, stop };
}

it('infers locally at a bounded cadence and releases tracks and model on stop', async () => {
  vi.useFakeTimers();
  const { video, stop } = setupVideo();
  const model = { detect: vi.fn().mockResolvedValue([{ class: 'person', score: 0.8 }]), dispose: vi.fn() };
  mocks.load.mockResolvedValue(model);
  const sample = vi.fn();
  const engine = new CameraEngine({ onSample: sample, onError: vi.fn() });
  await engine.start(video);
  await vi.advanceTimersByTimeAsync(0);
  expect(sample).toHaveBeenCalledWith(expect.objectContaining({ state: 'studying' }));
  await vi.advanceTimersByTimeAsync(849); expect(model.detect).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(model.detect).toHaveBeenCalledTimes(2);
  engine.stop();
  expect(stop).toHaveBeenCalledOnce(); expect(model.dispose).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

it('releases a model resolving after stop without starting inference', async () => {
  const { video, stop } = setupVideo();
  let resolve!: (model: unknown) => void;
  mocks.load.mockImplementation(() => new Promise(r => { resolve = r; }));
  const engine = new CameraEngine({ onSample: vi.fn(), onError: vi.fn() });
  const starting = engine.start(video);
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  engine.stop();
  const model = { dispose: vi.fn(), detect: vi.fn() }; resolve(model);
  await starting;
  expect(stop).toHaveBeenCalledOnce(); expect(model.dispose).toHaveBeenCalledOnce(); expect(model.detect).not.toHaveBeenCalled();
});

it('preserves preview on model failure and releases camera when explicitly stopped', async () => {
  const { video, stop } = setupVideo();
  mocks.load.mockRejectedValue(new Error('WebGL unavailable'));
  const error = vi.fn();
  const engine = new CameraEngine({ onSample: vi.fn(), onError: error });
  await engine.start(video);
  expect(stop).not.toHaveBeenCalled();
  expect(video.srcObject).not.toBeNull();
  expect(error).toHaveBeenCalledWith(expect.stringContaining('Detection model initialization/download'));
  expect(error).toHaveBeenCalledWith(expect.stringContaining('manual demo controls'));
  engine.stop();
  expect(stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
});

it('reports playback failure and releases the acquired camera', async () => {
  const { video, stop } = setupVideo();
  vi.mocked(video.play).mockRejectedValue(new Error('Playback blocked'));
  const error = vi.fn();
  await new CameraEngine({ onSample: vi.fn(), onError: error }).start(video);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('Video playback: Playback blocked'));
  expect(stop).toHaveBeenCalledOnce();
  expect(mocks.load).not.toHaveBeenCalled();
});
