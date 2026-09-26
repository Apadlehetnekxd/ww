import type { ScanMetrics } from './types';
import { createPointCloudRenderer } from './point-cloud-renderer';
import type { PointCloudRenderer } from './point-cloud-renderer';
import { ScanTracker } from './scan-tracker';
import type { ScanFrame, ScanObservation } from './scan-tracker';

/** Owns local frame sampling and the point canvas; the camera stream belongs to the caller. */
export class ScanEngine {
  private static readonly maxScanDuration = 30000;
  private renderer: PointCloudRenderer | null = null;
  private worker: Worker | null = null;
  private fallbackTracker: ScanTracker | null = null;
  private samplingCanvas = document.createElement('canvas');
  private samplingContext = this.samplingCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
  private running = false;
  private animationFrame = 0;
  private lastSample = -Infinity;
  private lastVideoTime = -1;
  private lastRender = 0;
  private lastMetrics = 0;
  private interval = 100;
  private sampleLongEdge = 720;
  private slowSamples = 0;
  private pending = false;
  private pendingSince = 0;
  private objectCoverage = 0;
  private orientation: number | null = null;
  private tilt: number | null = null;
  private rotationRate = 0;
  private acceleration = 0;
  private points = new Float32Array();
  private renderedPoints = new Float32Array();
  private pointIds = new Uint32Array();
  private began = 0;
  private progress = 0;
  private target = 0;
  private enoughContext = false;
  private metrics: ScanMetrics = { scanConfidence: 0, sceneCoverage: 0, viewpointCoverage: 0, featureStability: 0, objectCoverage: 0, progress: 0, complete: false, instruction: 'Move slowly around the room.', stablePoints: 0 };

  constructor(private video: HTMLVideoElement, private canvas: HTMLCanvasElement, private onMetrics: (metrics: ScanMetrics) => void) {}

  async start() {
    if (this.running) return;
    if (!this.samplingContext) throw new Error('Camera frame processing is unavailable.');
    this.running = true;
    this.began = performance.now();
    this.progress = 0;
    this.target = 0;
    this.enoughContext = false;
    try {
      const renderer = await createPointCloudRenderer(this.canvas);
      if (!this.running) { renderer.dispose(); return; }
      this.renderer = renderer;
      this.startWorker();
      this.onMetrics({ ...this.metrics });
      this.animationFrame = requestAnimationFrame(this.tick);
    } catch (error) { this.running = false; throw error; }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    this.worker?.terminate();
    this.worker = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.pending = false;
    this.fallbackTracker = null;
    this.points = new Float32Array();
    this.renderedPoints = new Float32Array();
    this.pointIds = new Uint32Array();
  }

  setObjectCoverage(value: number) { this.objectCoverage = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
  setOrientation(alpha: number | null, beta: number | null = null) {
    this.orientation = alpha !== null && Number.isFinite(alpha) ? alpha : null;
    this.tilt = beta !== null && Number.isFinite(beta) ? beta : null;
  }
  setInertialMotion(rotationRate: number, acceleration: number) {
    this.rotationRate = Number.isFinite(rotationRate) ? rotationRate : 0;
    this.acceleration = Number.isFinite(acceleration) ? acceleration : 0;
  }

  private startWorker() {
    try {
      this.worker = new Worker(new URL('./scan-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<ScanObservation & { processingMs: number }>) => {
        if (!this.running) return;
        this.pending = false;
        this.accept(event.data, event.data.processingMs);
      };
      this.worker.onerror = () => this.useMainThreadFallback();
    } catch { this.useMainThreadFallback(); }
  }

  private useMainThreadFallback() {
    this.worker?.terminate();
    this.worker = null;
    this.pending = false;
    this.fallbackTracker = new ScanTracker();
    this.interval = 140;
  }

  private accept(observation: ScanObservation, processingMs: number) {
    // Ignore frames captured during a sudden phone movement. Keeping the last
    // trusted cloud prevents the overlay from jumping or tearing across the view.
    const motionSpike = this.rotationRate > 2.8 || this.acceleration > 18;
    if (motionSpike) {
      this.pending = false;
      this.metrics = { ...this.metrics, instruction: 'Hold steady for a moment…' };
      return;
    }
    const bounds = this.canvas.getBoundingClientRect();
    const scale = Math.min(bounds.width / this.video.videoWidth, bounds.height / this.video.videoHeight);
    const width = this.video.videoWidth * scale / bounds.width;
    const height = this.video.videoHeight * scale / bounds.height;
    for (let offset = 0; offset < observation.points.length; offset += 4) {
      observation.points[offset] = observation.points[offset] * width + (1 - width) / 2;
      observation.points[offset + 1] = observation.points[offset + 1] * height + (1 - height) / 2;
    }
    // Join by stable feature identity so inserted/lost points never interpolate
    // to an unrelated feature. The renderer can animate between CV samples.
    const oldIndices = new Map<number, number>();
    this.pointIds.forEach((id, index) => oldIndices.set(id, index * 4));
    const interpolated = new Float32Array(observation.points.length);
    observation.pointIds.forEach((id, index) => {
      const offset = index * 4;
      const old = oldIndices.get(id);
      for (let channel = 0; channel < 4; channel++) {
        interpolated[offset + channel] = old !== undefined ? this.renderedPoints[old + channel] : channel === 2 ? 0 : observation.points[offset + channel];
      }
    });
    this.renderedPoints = interpolated;
    this.pointIds = observation.pointIds as Uint32Array<ArrayBuffer>;
    this.points = observation.points as Float32Array<ArrayBuffer>;
    this.enoughContext ||= observation.ready;
    const elapsed = this.began ? Math.max(0, performance.now() - this.began) : 0;
    if (elapsed >= ScanEngine.maxScanDuration) this.enoughContext = true;
    const timed = Math.min(.96, elapsed / ScanEngine.maxScanDuration);
    this.target = Math.max(this.target, this.enoughContext ? 1 : Math.max(timed, Math.min(.96, observation.metrics.scanConfidence)));
    this.metrics = { ...this.metrics, ...observation.metrics };
    // Keep processing comfortably below half a frame's sampling interval.
    const desired = Math.max(this.worker ? 70 : 120, Math.min(260, processingMs * (this.worker ? 2 : 3)));
    this.interval = this.interval * .85 + desired * .15;
    this.slowSamples = processingMs > 80 ? this.slowSamples + 1 : Math.max(0, this.slowSamples - 1);
    if (this.slowSamples > 8 && this.sampleLongEdge > 480) {
      this.sampleLongEdge -= 120;
      this.slowSamples = 0;
    }
  }

  private tick = (now: number) => {
    if (!this.running) return;
    const elapsed = this.lastRender ? Math.min(100, now - this.lastRender) : 16;
    // Render on every display frame (~60 FPS on a 60 Hz phone). Inference runs
    // independently and adapts to the device rather than throttling animation.
    {
      this.lastRender = now;
      const movementEase = 1 - Math.exp(-elapsed / 170);
      const appearanceEase = 1 - Math.exp(-elapsed / 300);
      for (let offset = 0; offset < this.points.length; offset += 4) {
        this.renderedPoints[offset] += (this.points[offset] - this.renderedPoints[offset]) * movementEase;
        this.renderedPoints[offset + 1] += (this.points[offset + 1] - this.renderedPoints[offset + 1]) * movementEase;
        this.renderedPoints[offset + 2] += (this.points[offset + 2] - this.renderedPoints[offset + 2]) * appearanceEase;
        this.renderedPoints[offset + 3] = this.points[offset + 3];
      }
      this.renderer?.render(this.renderedPoints);
      const lived = this.began ? Math.max(0, now - this.began) : 0;
      if (lived >= ScanEngine.maxScanDuration) { this.enoughContext = true; this.target = 1; this.progress = 1; }
      else this.progress += (this.target - this.progress) * (1 - Math.exp(-elapsed / 160));
      if (this.enoughContext && this.progress > .997) this.progress = 1;
      if (now - this.lastMetrics > 240 || (this.progress === 1 && !this.metrics.complete)) {
        this.lastMetrics = now;
        this.metrics = { ...this.metrics, progress: this.progress, complete: this.progress === 1, instruction: this.progress === 1 ? 'Environment understood' : this.metrics.instruction };
        this.onMetrics({ ...this.metrics });
      }
    }
    if (this.pending && now - this.pendingSince > 4000) this.useMainThreadFallback();
    if (!document.hidden && !this.pending && now - this.lastSample >= this.interval && this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.currentTime !== this.lastVideoTime) {
      this.lastSample = now;
      this.lastVideoTime = this.video.currentTime;
      void this.sample(now);
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private async sample(now: number) {
    const context = this.samplingContext!;
    // Process the complete sensor frame. Its sides used to be discarded to fill
    // a portrait viewport, hiding much of the surrounding room.
    const aspect = this.video.videoWidth / this.video.videoHeight;
    const longEdge = this.worker ? this.sampleLongEdge : 400;
    const width = Math.max(120, Math.round(aspect >= 1 ? longEdge : longEdge * aspect));
    const height = Math.max(120, Math.round(aspect >= 1 ? longEdge / aspect : longEdge));
    if (this.samplingCanvas.width !== width || this.samplingCanvas.height !== height) {
      this.samplingCanvas.width = width;
      this.samplingCanvas.height = height;
    }
    const worker = this.worker;
    const metadata = { width, height, orientation: this.orientation, tilt: this.tilt, objectCoverage: this.objectCoverage,
      rotationRate: this.rotationRate, acceleration: this.acceleration, timestamp: now };
    try {
      if (worker && typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined') {
        this.pending = true;
        this.pendingSince = now;
        const bitmap = await createImageBitmap(this.video);
        if (!this.running || this.worker !== worker) { bitmap.close(); return; }
        worker.postMessage({ ...metadata, bitmap }, [bitmap]);
        return;
      }
      context.drawImage(this.video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const frame: ScanFrame = {
        pixels, ...metadata,
      };
      if (this.worker) {
        this.pending = true;
        this.pendingSince = now;
        this.worker.postMessage(frame, [pixels.buffer]);
      } else {
        this.fallbackTracker ??= new ScanTracker();
        const start = performance.now();
        this.accept(this.fallbackTracker.process(frame), performance.now() - start);
      }
    } catch {
      // A camera may temporarily have no decodable frame during rotation or interruption.
      this.pending = false;
    }
  }
}
