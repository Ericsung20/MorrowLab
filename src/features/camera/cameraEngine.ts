import type { FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision';
import { FocusClassifier, facePose, INFERENCE_INTERVAL_MS, PERSON_THRESHOLD } from './cameraTypes';
import type { CameraSample, FrameObservation, ModelStatus } from './cameraTypes';

// Models run locally in the browser; only the model files are downloaded (and cached) once.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// EfficientDet-Lite2 catches small or partly visible phones far better than COCO-SSD lite.
const OBJECT_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float32/1/efficientdet_lite2.tflite';

interface CameraCallbacks {
  onSample(sample: CameraSample): void;
  onStatus?(status: ModelStatus): void;
  onError(message: string): void;
}
interface Models { objects: ObjectDetector; faces: FaceLandmarker }

async function loadModels(): Promise<Models> {
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
  try { return await create('GPU'); } catch { return create('CPU'); }
}

export function observe(models: Models, video: HTMLVideoElement, timestamp: number): FrameObservation {
  const detections = models.objects.detectForVideo(video, timestamp).detections;
  const best = (name: string) => detections.flatMap(d => d.categories).filter(c => c.categoryName === name).map(c => c.score);
  const faces = models.faces.detectForVideo(video, timestamp);
  return {
    phone: Math.max(0, ...best('cell phone')),
    people: best('person').filter(s => s >= PERSON_THRESHOLD).length,
    faces: faces.faceLandmarks.map((landmarks, i) => facePose(landmarks, faces.faceBlendshapes[i]?.categories, video.videoHeight / video.videoWidth || 0.75)),
  };
}

export class CameraEngine {
  private generation = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private models: Models | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly callbacks: CameraCallbacks;
  constructor(callbacks: CameraCallbacks) { this.callbacks = callbacks; }

  /** Call only from an explicit user action. No media is persisted or uploaded. */
  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.callbacks.onStatus?.('loading');
    let stage = 'Camera permission';
    let previewStarted = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      this.video = video;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      stage = 'Video playback';
      await video.play();
      if (generation !== this.generation) return;
      previewStarted = true;
      stage = 'Detection model initialization/download';
      const models = await loadModels();
      if (generation !== this.generation) { models.objects.close(); models.faces.close(); return; }
      this.models = models;
      this.callbacks.onStatus?.('ready');
      const classifier = new FocusClassifier();
      let lastReady = Date.now();
      let lastFrameTime = -1;
      const infer = () => {
        if (generation !== this.generation) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            lastReady = Date.now();
            // MediaPipe VIDEO mode requires strictly increasing timestamps.
            lastFrameTime = Math.max(lastFrameTime + 1, performance.now());
            this.callbacks.onSample(classifier.classify(observe(models, video, lastFrameTime), Date.now()));
          } else if (Date.now() - lastReady > 10000) {
            throw new Error('The camera is not providing video frames.');
          }
          if (generation === this.generation) this.timer = setTimeout(infer, INFERENCE_INTERVAL_MS);
        } catch (error) { if (generation === this.generation) this.fail(error, true, 'Detection'); }
      };
      infer();
    } catch (error) { if (generation === this.generation) this.fail(error, previewStarted, stage); }
  }

  private fail(error: unknown, preservePreview = false, stage = 'Camera') {
    if (preservePreview) this.stopInference();
    else this.stop();
    this.callbacks.onStatus?.('error');
    const detail = error instanceof Error ? error.message : 'Camera or model unavailable.';
    this.callbacks.onError(`${stage}: ${detail}${preservePreview ? ' Camera preview remains available; automatic detection is stopped.' : ''} Session tracking can continue with manual demo controls.`);
  }

  private stopInference() {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.models?.objects.close();
    this.models?.faces.close();
    this.models = null;
  }

  stop() {
    this.stopInference();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.stream = null;
    this.video = null;
  }
}
