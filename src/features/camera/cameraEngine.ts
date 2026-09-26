import type { ObjectDetection } from '@tensorflow-models/coco-ssd';
import { deriveSample, INFERENCE_INTERVAL_MS } from './cameraTypes';
import type { CameraSample, ModelStatus } from './cameraTypes';

interface CameraCallbacks {
  onSample(sample: CameraSample): void;
  onStatus?(status: ModelStatus): void;
  onError(message: string): void;
}

export class CameraEngine {
  private generation = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private model: ObjectDetection | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private readonly callbacks: CameraCallbacks;
  constructor(callbacks: CameraCallbacks) { this.callbacks = callbacks; }

  /** Call only from an explicit user action. No media is persisted or uploaded. */
  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.callbacks.onStatus?.('loading');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      this.video = video;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (generation !== this.generation) return;
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const coco = await import('@tensorflow-models/coco-ssd');
      if (generation !== this.generation) return;
      const model = await coco.load({ base: 'lite_mobilenet_v2' });
      if (generation !== this.generation) { model.dispose(); return; }
      this.model = model;
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      this.canvas = canvas;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Local video processing is unavailable.');
      this.callbacks.onStatus?.('ready');
      let lastReady = Date.now();
      const infer = async () => {
        if (generation !== this.generation) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            lastReady = Date.now();
            context.drawImage(video, 0, 0, 320, 240);
            // COCO's default threshold is too high for the required phone threshold.
            const detections = await model.detect(canvas, 20, 0.35);
            context.clearRect(0, 0, 320, 240);
            if (generation !== this.generation) return;
            this.callbacks.onSample(deriveSample(detections, Date.now()));
          } else if (Date.now() - lastReady > 10000) {
            throw new Error('The camera is not providing video frames.');
          }
          if (generation === this.generation) this.timer = setTimeout(() => void infer(), INFERENCE_INTERVAL_MS);
        } catch (error) { if (generation === this.generation) this.fail(error); }
      };
      void infer();
    } catch (error) { if (generation === this.generation) this.fail(error); }
  }

  private fail(error: unknown) {
    this.stop();
    this.callbacks.onStatus?.('error');
    const detail = error instanceof Error ? error.message : 'Camera or model unavailable.';
    this.callbacks.onError(`${detail} Session tracking can continue with manual demo controls.`);
  }

  stop() {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.stream = null;
    this.video = null;
    this.model?.dispose();
    this.model = null;
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0; }
    this.canvas = null;
  }
}
