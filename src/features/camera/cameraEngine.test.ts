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
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 }, videoWidth: { value: 640 },
    currentTime: { configurable: true, get: () => Date.now() / 1000 },
  });
  const track = Object.assign(new EventTarget(), { readyState: 'live', muted: false, stop: vi.fn() });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] }) } });
  return { video, stop: track.stop, track };
}

it('infers locally at a bounded cadence and releases tracks and models on stop', async () => {
  vi.useFakeTimers();
  const { video, stop } = setupVideo();
  const { objects, faces } = models();
  const sample = vi.fn();
  const pose = vi.fn();
  const engine = new CameraEngine({ onSample: sample, onPose: pose, onError: vi.fn() });
  await engine.start(video);
  // Body visible without a face: treated as studying (head down, writing).
  expect(sample).toHaveBeenCalledWith(expect.objectContaining({ state: 'studying' }));
  expect(mocks.objects).toHaveBeenCalledWith(undefined, expect.objectContaining({ runningMode: 'VIDEO', baseOptions: expect.objectContaining({ delegate: 'GPU' }) }));
  await vi.advanceTimersByTimeAsync(499); expect(objects.detectForVideo).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(objects.detectForVideo).toHaveBeenCalledTimes(2);
  expect(faces.detectForVideo).toHaveBeenCalledTimes(11);
  expect(pose).toHaveBeenCalledTimes(11);
  expect(pose).toHaveBeenLastCalledWith(null);
  expect(sample).toHaveBeenCalledTimes(2);
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

it('streams facial expressions between classification samples and resets on face loss', async () => {
  vi.useFakeTimers();
  const { video } = setupVideo();
  const { faces, objects } = models();
  const landmarks = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  landmarks[234].x = 0.3; landmarks[454].x = 0.7;
  faces.detectForVideo.mockReturnValue({ faceLandmarks: [landmarks], faceBlendshapes: [{ categories: [
    { categoryName: 'eyeBlinkLeft', score: 1 }, { categoryName: 'jawOpen', score: 0.8 },
  ] }] } as never);
  const onPose = vi.fn();
  const engine = new CameraEngine({ onSample: vi.fn(), onPose, onError: vi.fn() });
  await engine.start(video);
  expect(onPose).toHaveBeenLastCalledWith(expect.objectContaining({ expression: expect.objectContaining({ blinkLeft: 1, blinkRight: 0, mouthOpen: 0.8 }) }));
  faces.detectForVideo.mockReturnValue({ faceLandmarks: [], faceBlendshapes: [] });
  await vi.advanceTimersByTimeAsync(50);
  expect(onPose).toHaveBeenLastCalledWith(null);
  expect(objects.detectForVideo).toHaveBeenCalledTimes(1);
  engine.stop();
  const count = onPose.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(onPose).toHaveBeenCalledTimes(count);
});

it('waits through a long background camera suspension and resumes when new frames return', async () => {
  vi.useFakeTimers();
  const { video, track } = setupVideo();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const { faces } = models();
  const onSample = vi.fn(), onError = vi.fn(), onStatus = vi.fn(), onInterrupted = vi.fn();
  const engine = new CameraEngine({ onSample, onError, onStatus, onInterrupted });
  await engine.start(video);
  const lastFrame = Date.now();
  visibility.mockReturnValue('hidden');
  track.muted = true; track.dispatchEvent(new Event('mute'));
  vi.advanceTimersByTime(60 * 60 * 1000);
  expect(onError).not.toHaveBeenCalled();
  expect(onInterrupted).toHaveBeenCalledExactlyOnceWith(lastFrame);
  expect(faces.detectForVideo).toHaveBeenCalledTimes(1);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible'); track.muted = false;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(onStatus).toHaveBeenLastCalledWith('ready');
  expect(onSample).toHaveBeenCalledTimes(2);
  engine.stop(); expect(vi.getTimerCount()).toBe(0);
});

it('keeps healthy background monitoring running for a simulated hour at a reduced cadence', async () => {
  vi.useFakeTimers();
  const { video } = setupVideo();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const { faces, objects } = models();
  const onError = vi.fn();
  const engine = new CameraEngine({ onSample: vi.fn(), onError });
  await engine.start(video);
  vi.advanceTimersByTime(60 * 60 * 1000);
  expect(faces.detectForVideo).toHaveBeenCalledTimes(7201);
  expect(objects.detectForVideo).toHaveBeenCalledTimes(7201);
  expect(mocks.faces).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
  engine.stop();
});

it('reacquires an ended camera track and cleans event listeners on stop', async () => {
  vi.useFakeTimers();
  const { video, track } = setupVideo(); models();
  const replacement = Object.assign(new EventTarget(), { readyState: 'live', muted: false, stop: vi.fn() });
  const onStatus = vi.fn(), onError = vi.fn();
  const engine = new CameraEngine({ onSample: vi.fn(), onStatus, onError });
  await engine.start(video);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce({ getTracks: () => [replacement], getVideoTracks: () => [replacement] } as unknown as MediaStream);
  track.readyState = 'ended'; track.dispatchEvent(new Event('ended'));
  await vi.advanceTimersByTimeAsync(0);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  expect(onStatus).toHaveBeenLastCalledWith('ready');
  expect(onError).not.toHaveBeenCalled();
  engine.stop();
  replacement.dispatchEvent(new Event('ended'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  expect(replacement.stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not reclassify frozen frames and reconnects a stalled visible camera', async () => {
  vi.useFakeTimers();
  const { video } = setupVideo();
  const { faces } = models();
  Object.defineProperty(video, 'currentTime', { configurable: true, value: 1 });
  const engine = new CameraEngine({ onSample: vi.fn(), onError: vi.fn() });
  await engine.start(video);
  await vi.advanceTimersByTimeAsync(10000);
  expect(faces.detectForVideo).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  engine.stop();
});

it('rebuilds failed inference models on CPU without stopping the camera stream', async () => {
  vi.useFakeTimers();
  const { video, stop } = setupVideo();
  const first = models(), replacement = models();
  mocks.objects.mockResolvedValueOnce(first.objects); mocks.faces.mockResolvedValueOnce(first.faces);
  const onError = vi.fn(), onStatus = vi.fn();
  const engine = new CameraEngine({ onSample: vi.fn(), onError, onStatus });
  await engine.start(video);
  first.faces.detectForVideo.mockImplementationOnce(() => { throw new Error('WebGL context lost'); });
  await vi.advanceTimersByTimeAsync(100);
  expect(first.faces.close).toHaveBeenCalledOnce();
  expect(mocks.faces).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ baseOptions: expect.objectContaining({ delegate: 'CPU' }) }));
  expect(replacement.faces.detectForVideo).toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
  expect(onStatus).toHaveBeenLastCalledWith('ready');
  engine.stop();
});

it('releases a late camera reconnection after the session is stopped', async () => {
  vi.useFakeTimers();
  const { video, track } = setupVideo(); models();
  const engine = new CameraEngine({ onSample: vi.fn(), onError: vi.fn() });
  await engine.start(video);
  let resolve!: (stream: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  track.dispatchEvent(new Event('ended'));
  engine.stop();
  const stop = vi.fn(); resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await vi.advanceTimersByTimeAsync(0);
  expect(stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

it('bounds reconnection attempts and does not retry permission denials', async () => {
  vi.useFakeTimers();
  const { video, track } = setupVideo(); models();
  const onError = vi.fn();
  const engine = new CameraEngine({ onSample: vi.fn(), onError });
  await engine.start(video);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('Device busy'));
  track.dispatchEvent(new Event('ended'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(4);
  expect(onError).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  engine.stop();
  const denied = setupVideo();
  const second = new CameraEngine({ onSample: vi.fn(), onError: vi.fn() });
  await second.start(denied.video);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException('Permission revoked', 'NotAllowedError'));
  denied.track.dispatchEvent(new Event('ended'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  second.stop();
});

it('does not bridge an OS sleep gap with the previously detected study state', async () => {
  vi.useFakeTimers();
  const { video } = setupVideo(); models();
  const onInterrupted = vi.fn(), onSample = vi.fn();
  const engine = new CameraEngine({ onSample, onInterrupted, onError: vi.fn() });
  await engine.start(video);
  const beforeSleep = Date.now();
  vi.setSystemTime(beforeSleep + 60 * 60 * 1000);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(50);
  expect(onInterrupted).toHaveBeenCalledExactlyOnceWith(beforeSleep);
  expect(onSample).toHaveBeenCalledTimes(2);
  engine.stop();
});
