import type { HeadTracking } from '../../contracts/faceTracking';
import type { FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision';
import { FocusClassifier, facePose, INFERENCE_INTERVAL_MS, FACE_INTERVAL_MS, PERSON_THRESHOLD } from './cameraTypes';
import type { CameraSample, FrameObservation, ModelStatus } from './cameraTypes';

// Models run locally in the browser; only the model files are downloaded (and cached) once.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// EfficientDet-Lite2 catches small or partly visible phones far better than COCO-SSD lite.
const OBJECT_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float32/1/efficientdet_lite2.tflite';

interface CameraCallbacks {
  onSample(sample: CameraSample): void;
  onPose?(pose: HeadTracking | null): void;
  /** End the last observed interval at the last live frame, excluding camera outages. */
  onInterrupted?(lastFrameAt: number): void;
  onStatus?(status: ModelStatus): void;
  onError(message: string): void;
}
interface Models { objects: ObjectDetector; faces: FaceLandmarker }

async function loadModels(preferred: 'GPU' | 'CPU' = 'GPU'): Promise<Models> {
  const vision = await import('@mediapipe/tasks-vision');
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
  const create = async (delegate: 'GPU' | 'CPU'): Promise<Models> => {
    const [objects, faces] = await Promise.allSettled([
      vision.ObjectDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: OBJECT_MODEL, delegate }, runningMode: 'VIDEO', scoreThreshold: 0.2, maxResults: 10, categoryAllowlist: ['cell phone', 'person'] }),
      vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', numFaces: 3, outputFaceBlendshapes: true }),
    ]);
    if (objects.status === 'fulfilled' && faces.status === 'fulfilled') return { objects: objects.value, faces: faces.value };
    for (const r of [objects, faces]) if (r.status === 'fulfilled') r.value.close();
    throw (objects.status === 'rejected' ? objects.reason : (faces as PromiseRejectedResult).reason);
  };
  // Some machines lack WebGL2; the CPU path is slower but works everywhere.
  if (preferred === 'CPU') return create('CPU');
  try { return await create('GPU'); } catch { return create('CPU'); }
}

function observeFaces(models: Models, video: HTMLVideoElement, timestamp: number) {
  const faces = models.faces.detectForVideo(video, timestamp);
  return faces.faceLandmarks.map((landmarks, i) => facePose(landmarks, faces.faceBlendshapes[i]?.categories, video.videoHeight / video.videoWidth || 0.75));
}
export function observe(models: Models, video: HTMLVideoElement, timestamp: number, faces = observeFaces(models, video, timestamp)): FrameObservation {
  const detections = models.objects.detectForVideo(video, timestamp).detections;
  const best = (name: string) => detections.flatMap(d => d.categories).filter(c => c.categoryName === name).map(c => c.score);
  // Where the most confident phone sits vertically (0 top, 1 bottom): held up vs lying on the desk.
  let phone = 0, phoneY: number | undefined;
  for (const d of detections) for (const c of d.categories) {
    if (c.categoryName !== 'cell phone' || c.score <= phone) continue;
    phone = c.score;
    phoneY = d.boundingBox && video.videoHeight ? (d.boundingBox.originY + d.boundingBox.height / 2) / video.videoHeight : undefined;
  }
  return { phone, phoneY, people: best('person').filter(s => s >= PERSON_THRESHOLD).length, faces };
}

const CAMERA_CONSTRAINTS = { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false } as const;
const STALL_MS = 10000;
const MAX_RECOVERIES = 3;

function releaseModels(models: Models | null) {
  // A lost GPU context can also throw during disposal. Always release the other model.
  for (const model of [models?.objects, models?.faces]) { try { model?.close(); } catch { /* Already lost. */ } }
}

export class CameraEngine {
  private generation = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private models: Models | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unbindTrack: (() => void) | null = null;
  private classifier = new FocusClassifier();
  private recovering = false;
  private suspended = false;
  private recoveryAttempts = 0;
  private healthySince = 0;
  private lastVideoTime = -1;
  private lastFrameTime = -1;
  private lastFrameAt = 0;
  private lastProgressAt = 0;
  private lastClassification = -Infinity;
  private playing = false;
  private readonly callbacks: CameraCallbacks;
  constructor(callbacks: CameraCallbacks) { this.callbacks = callbacks; }

  /** Call only from an explicit user action. No media is persisted or uploaded. */
  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.video = video;
    this.recoveryAttempts = 0;
    this.classifier = new FocusClassifier();
    this.lastVideoTime = -1;
    this.lastFrameTime = -1;
    this.lastClassification = -Infinity;
    this.lastFrameAt = this.lastProgressAt = Date.now();
    this.callbacks.onStatus?.('loading');
    let stage = 'Camera permission';
    let previewStarted = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      video.srcObject = stream;
      video.muted = true; video.playsInline = true; video.autoplay = true;
      stage = 'Video playback';
      await video.play();
      if (generation !== this.generation) return;
      previewStarted = true;
      stage = 'Detection model initialization/download';
      const models = await loadModels();
      if (generation !== this.generation) { releaseModels(models); return; }
      this.models = models;
      this.bindTrack();
      document.addEventListener('visibilitychange', this.wake);
      window.addEventListener('pageshow', this.wake);
      video.addEventListener('pause', this.resumePlayback);
      this.lastProgressAt = Date.now();
      this.healthySince = Date.now();
      this.callbacks.onStatus?.('ready');
      this.infer();
    } catch (error) { if (generation === this.generation) this.fail(error, previewStarted, stage); }
  }

  private bindTrack() {
    this.unbindTrack?.();
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    const muted = () => this.suspend();
    const ended = () => { void this.recover('stream'); };
    track.addEventListener('mute', muted);
    track.addEventListener('unmute', this.wake);
    track.addEventListener('ended', ended);
    this.unbindTrack = () => {
      track.removeEventListener('mute', muted);
      track.removeEventListener('unmute', this.wake);
      track.removeEventListener('ended', ended);
    };
  }

  private suspend() {
    if (this.suspended) return;
    this.suspended = true;
    this.healthySince = 0;
    this.lastClassification = -Infinity;
    this.callbacks.onPose?.(null);
    this.callbacks.onInterrupted?.(this.lastFrameAt);
    this.callbacks.onStatus?.('loading');
  }

  private schedule(delay: number) {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(this.infer, delay);
  }

  private wake = () => {
    if (!this.models || this.recovering || document.visibilityState === 'hidden') return;
    // Browser suspension isn't a ten-second camera failure: give it time to deliver new frames.
    if (Date.now() - this.lastProgressAt > STALL_MS) this.suspend();
    this.lastProgressAt = Date.now();
    this.resumePlayback();
    this.schedule(0);
  };

  private resumePlayback = () => {
    const video = this.video;
    if (!video || !this.models || this.recovering || this.playing || document.visibilityState === 'hidden') return;
    this.playing = true;
    const generation = this.generation;
    void video.play().catch(() => {
      if (generation === this.generation) this.suspend();
    }).finally(() => { if (generation === this.generation) this.playing = false; });
  };

  private infer = () => {
    this.timer = null;
    const video = this.video, models = this.models;
    if (!video || !models || this.recovering) return;
    const now = Date.now();
    const hidden = document.visibilityState === 'hidden';
    const track = this.stream?.getVideoTracks()[0];
    // Timers can disappear during system sleep. Do not bridge that unobserved gap with study time.
    if (now - this.lastProgressAt > STALL_MS) this.suspend();
    if (track?.readyState === 'ended') { void this.recover('stream'); return; }
    const fresh = !track?.muted && video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== this.lastVideoTime;
    if (!fresh) {
      if (now - this.lastProgressAt > 1500 || track?.muted) this.suspend();
      if (!hidden && now - this.lastProgressAt > STALL_MS) { void this.recover('stream'); return; }
      this.schedule(hidden || this.suspended ? INFERENCE_INTERVAL_MS : FACE_INTERVAL_MS);
      return;
    }
    try {
      // No repeated inference on a frozen frame. VIDEO timestamps must increase even after resuming.
      this.lastVideoTime = video.currentTime;
      this.lastFrameTime = Math.max(this.lastFrameTime + 1, performance.now());
      const faces = observeFaces(models, video, this.lastFrameTime);
      let sample: CameraSample | undefined;
      if (now - this.lastClassification >= INFERENCE_INTERVAL_MS) {
        sample = this.classifier.classify(observe(models, video, this.lastFrameTime, faces), now);
        this.lastClassification = now;
      }
      this.lastFrameAt = this.lastProgressAt = now;
      if (this.suspended) { this.suspended = false; this.callbacks.onStatus?.('ready'); }
      if (!this.healthySince) this.healthySince = now;
      if (now - this.healthySince >= 10000) this.recoveryAttempts = 0;
      if (sample) this.callbacks.onSample(sample);
      this.callbacks.onPose?.(this.classifier.tracking(faces));
      // Keep study detection in the background, without paying for invisible 20 Hz facial animation.
      this.schedule(hidden ? INFERENCE_INTERVAL_MS : FACE_INTERVAL_MS);
    } catch { void this.recover('models'); }
  };

  private async recover(kind: 'stream' | 'models') {
    if (this.recovering || !this.video) return;
    this.suspend();
    if (++this.recoveryAttempts > MAX_RECOVERIES) {
      this.fail(new Error('Automatic reconnection failed. Check camera permission or close another app using the camera.'), true, 'Camera recovery');
      return;
    }
    this.recovering = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const generation = this.generation, video = this.video;
    try {
      if (kind === 'stream') {
        this.unbindTrack?.(); this.unbindTrack = null;
        this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream; video.srcObject = stream;
        await video.play();
        if (generation !== this.generation) return;
        this.bindTrack();
      } else {
        releaseModels(this.models); this.models = null;
        // A GPU context lost during a long session must not permanently disable detection.
        const models = await loadModels('CPU');
        if (generation !== this.generation) { releaseModels(models); return; }
        this.models = models;
      }
      this.lastVideoTime = -1;
      this.lastProgressAt = Date.now();
      this.recovering = false;
      this.schedule(0);
    } catch (error) {
      if (generation !== this.generation) return;
      this.recovering = false;
      const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.fail(error, true, 'Camera permission'); return;
      }
      // Back off after device/model failures; never leave overlapping requests or unlimited retries.
      this.timer = setTimeout(() => { this.timer = null; void this.recover(kind); }, 1000 * this.recoveryAttempts);
    }
  }

  private fail(error: unknown, preservePreview = false, stage = 'Camera') {
    if (preservePreview) this.stopInference(); else this.stop();
    this.callbacks.onPose?.(null);
    this.callbacks.onStatus?.('error');
    const detail = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : 'Camera or model unavailable.';
    this.callbacks.onError(`${stage}: ${detail}${preservePreview ? ' Automatic detection is stopped.' : ''} Session tracking can continue with manual demo controls.`);
  }

  private stopInference() {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.unbindTrack?.(); this.unbindTrack = null;
    document.removeEventListener('visibilitychange', this.wake);
    window.removeEventListener('pageshow', this.wake);
    this.video?.removeEventListener('pause', this.resumePlayback);
    releaseModels(this.models); this.models = null;
    this.recovering = false; this.suspended = false; this.playing = false;
  }

  stop() {
    this.stopInference();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.stream = null; this.video = null;
  }
}
