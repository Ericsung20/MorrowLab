import { afterEach, expect, it, vi } from 'vitest';
import { CameraEngine } from './cameraEngine';

const mocks = vi.hoisted(() => ({ objects: vi.fn(), faces: vi.fn(), fileset: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mocks.fileset },
  ObjectDetector: { createFromOptions: mocks.objects },
  FaceLandmarker: { createFromOptions: mocks.faces },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); mocks.objects.mockReset(); mocks.faces.mockReset(); });

function models(people = 1) {
  const objects = { detectForVideo: vi.fn(() => ({ detections: Array.from({ length: people }, () => ({ categories: [{ categoryName: 'person', score: 0.8 }] })) })), close: vi.fn() };
  const faces = { detectForVideo: vi.fn(() => ({ faceLandmarks: [], faceBlendshapes: [] })), close: vi.fn() };
  mocks.objects.mockResolvedValue(objects);
  mocks.faces.mockResolvedValue(faces);
  return { objects, faces };
}

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
  return { video, stop };
}

it('infers locally at a bounded cadence and releases tracks and models on stop', async () => {
  vi.useFakeTimers();
  const { video, stop } = setupVideo();
  const { objects, faces } = models();
  const sample = vi.fn();
  const engine = new CameraEngine({ onSample: sample, onError: vi.fn() });
  await engine.start(video);
  // Body visible without a face: treated as studying (head down, writing).
  expect(sample).toHaveBeenCalledWith(expect.objectContaining({ state: 'studying' }));
  expect(mocks.objects).toHaveBeenCalledWith(undefined, expect.objectContaining({ runningMode: 'VIDEO', baseOptions: expect.objectContaining({ delegate: 'GPU' }) }));
  await vi.advanceTimersByTimeAsync(499); expect(objects.detectForVideo).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(objects.detectForVideo).toHaveBeenCalledTimes(2);
  const [first, second] = faces.detectForVideo.mock.calls.map(c => (c as unknown[])[1] as number);
  expect(second).toBeGreaterThan(first);
  engine.stop();
  expect(stop).toHaveBeenCalledOnce(); expect(objects.close).toHaveBeenCalledOnce(); expect(faces.close).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

it('falls back to the CPU when the GPU delegate is unavailable', async () => {
  const { video } = setupVideo();
  const { objects } = models(0);
  mocks.faces.mockRejectedValueOnce(new Error('WebGL2 unavailable'));
  const sample = vi.fn();
  const engine = new CameraEngine({ onSample: sample, onError: vi.fn() });
  await engine.start(video);
  expect(objects.close).toHaveBeenCalledOnce(); // GPU object detector released
  expect(mocks.faces).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ baseOptions: expect.objectContaining({ delegate: 'CPU' }) }));
  expect(sample).toHaveBeenCalledWith(expect.objectContaining({ state: 'away' }));
  engine.stop();
});

it('releases models resolving after stop without starting inference', async () => {
  const { video, stop } = setupVideo();
  const { objects, faces } = models();
  let resolve!: (model: unknown) => void;
  mocks.faces.mockImplementation(() => new Promise(r => { resolve = r; }));
  const engine = new CameraEngine({ onSample: vi.fn(), onError: vi.fn() });
  const starting = engine.start(video);
  await vi.waitFor(() => expect(mocks.faces).toHaveBeenCalledOnce());
  engine.stop();
  resolve(faces);
  await starting;
  expect(stop).toHaveBeenCalledOnce(); expect(faces.close).toHaveBeenCalledOnce(); expect(objects.close).toHaveBeenCalledOnce();
  expect(objects.detectForVideo).not.toHaveBeenCalled();
});

it('preserves preview on model failure and releases camera when explicitly stopped', async () => {
  const { video, stop } = setupVideo();
  mocks.objects.mockRejectedValue(new Error('Model download failed'));
  mocks.faces.mockRejectedValue(new Error('Model download failed'));
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
  expect(mocks.objects).not.toHaveBeenCalled();
});
