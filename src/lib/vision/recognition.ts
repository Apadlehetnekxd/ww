import { clearVisionObservations, rememberSceneObservations } from './ai-service';
import type { RecognitionWorkerResponse } from './recognition-protocol';
import { PointingSelection, SceneMemory, pointingRayFromHand } from './scene-memory';
import type { Point2, PointingRay, RecognitionFrame } from './types';

/** Slow, local inference pipeline independent from the camera and point renderer. */
export class RecognitionController {
  private worker: Worker | null = null;
  private readonly memory = new SceneMemory();
  private readonly selection = new PointingSelection();
  private readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d', { alpha: false });
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private busy = false;
  private objectsEnabled = false;
  private handsEnabled = false;
  private lastObjects = -Infinity;
  private lastHands = -Infinity;
  private lastVideoTime = -1;
  private averageCost = 100;
  private pointing: PointingRay | null = null;
  private lastPointing = 0;
  private hand: Point2[] | null = null;
  private handSeen = 0;
  private handCandidates = 0;

  private plausibleHand(landmarks: (Point2 & { z?: number })[]) {
    if (landmarks.length < 21 || landmarks.some(point => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return false;
    const distance = (a: number, b: number) => Math.hypot(landmarks[a].x - landmarks[b].x, landmarks[a].y - landmarks[b].y);
    return distance(0, 9) > 0.025 && distance(5, 17) > 0.02 && distance(0, 8) > 0.045;
  }

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onFrame: (frame: RecognitionFrame) => void,
    private readonly onStatus: (message: string) => void,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.context || typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      this.onStatus('Local recognition is not supported by this browser. Camera scanning still works.');
      return;
    }
    this.running = true;
    try {
      this.worker = new Worker(new URL('./recognition.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<RecognitionWorkerResponse>) => this.receive(event.data);
      this.worker.onerror = () => this.unavailable('Local recognition could not start. Camera scanning still works.');
      this.watchdog = setTimeout(() => this.unavailable('Recognition models could not download. Check your connection and restart Vision.'), 85000);
      this.worker.postMessage({ type: 'init' });
      // Resolves immediately: downloading recognition models must not delay the scan.
    } catch { this.unavailable('Local recognition is unavailable. Camera scanning still works.'); }
  }

  private receive(message: RecognitionWorkerResponse): void {
    if (!this.running) return;
    if (message.type === 'status') { this.onStatus(message.message); return; }
    if (message.type === 'error') { this.unavailable(message.message); return; }
    clearTimeout(this.watchdog);
    if (message.type === 'ready') {
      this.objectsEnabled = message.objects;
      this.handsEnabled = message.hands;
      if (!message.objects && !message.hands) { this.unavailable('Local recognition is unavailable. Camera scanning still works.'); return; }
    } else {
      this.busy = false;
      this.averageCost = this.averageCost * 0.7 + Math.min(3000, message.duration) * 0.3;
      if (message.observations) {
        this.memory.update(message.observations);
        rememberSceneObservations(this.memory.recent());
      }
      if (message.landmarks) {
        const validHands = message.landmarks.filter(hand => this.plausibleHand(hand));
        const nextHand = validHands[0] ?? null;
        if (nextHand) {
          this.handCandidates++;
          if (!this.hand || this.handCandidates >= 2) {
            this.hand = nextHand;
            this.handSeen = performance.now();
          }
        } else {
          this.handCandidates = 0;
          if (performance.now() - this.handSeen > 650) this.hand = null;
        }
        const aspect = this.video.videoWidth / Math.max(1, this.video.videoHeight);
        const next = validHands.map((hand) => pointingRayFromHand(hand, aspect)).find(Boolean) ?? null;
        if (next) {
          if (this.pointing && next.direction.x * this.pointing.direction.x + next.direction.y * this.pointing.direction.y > 0.5) {
            const dx = this.pointing.direction.x * 0.12 + next.direction.x * 0.88;
            const dy = this.pointing.direction.y * 0.12 + next.direction.y * 0.88;
            const length = Math.hypot(dx, dy);
            this.pointing = {
              origin: { x: this.pointing.origin.x * 0.3 + next.origin.x * 0.7, y: this.pointing.origin.y * 0.3 + next.origin.y * 0.7 },
              direction: { x: dx / length, y: dy / length },
            };
          } else this.pointing = next;
          this.lastPointing = performance.now();
        } else if (performance.now() - this.lastPointing > 650) this.pointing = null;
      }
    }
    this.emit();
    this.schedule(60);
  }

  private emit(): void {
    const now = performance.now();
    if (now - this.lastPointing > 900) this.pointing = null;
    const objects = this.memory.visible();
    const selectedId = this.selection.update(this.pointing, objects, now, this.video.videoWidth / Math.max(1, this.video.videoHeight));
    this.onFrame({ objects, pointing: this.pointing, selectedId, hand: now - this.handSeen < 650 ? this.hand : null });
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    if (this.running) this.timer = setTimeout(() => { void this.sample(); }, delay);
  }

  private async sample(): Promise<void> {
    if (!this.running || this.busy || !this.worker) return;
    this.emit();
    if (document.hidden || this.video.readyState < 2 || !this.video.videoWidth || this.video.currentTime === this.lastVideoTime) {
      this.schedule(180); return;
    }
    const now = performance.now();
    const objectInterval = Math.max(this.pointing ? 420 : 850, Math.min(1800, this.averageCost * 2.2));
    const handInterval = Math.max(this.hand ? 55 : 100, Math.min(420, this.averageCost * 0.9));
    const objects = this.objectsEnabled && now - this.lastObjects >= objectInterval;
    const hands = this.handsEnabled && now - this.lastHands >= handInterval;
    if (!objects && !hands) { this.schedule(65); return; }
    this.busy = true;
    const worker = this.worker;
    try {
      // Preserve the original aspect ratio and normalized sensor coordinates.
      const scale = Math.min(1, 640 / Math.max(this.video.videoWidth, this.video.videoHeight));
      const width = Math.max(1, Math.round(this.video.videoWidth * scale));
      const height = Math.max(1, Math.round(this.video.videoHeight * scale));
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this.context!.drawImage(this.video, 0, 0, width, height);
      const bitmap = await createImageBitmap(this.canvas);
      if (!this.running || this.worker !== worker) { bitmap.close(); return; }
      this.lastVideoTime = this.video.currentTime;
      if (objects) this.lastObjects = now;
      if (hands) this.lastHands = now;
      this.watchdog = setTimeout(() => this.unavailable('Recognition paused because this device could not process the frame.'), 12000);
      worker.postMessage({ type: 'frame', bitmap, timestamp: now, objects, hands }, [bitmap]);
    } catch {
      this.busy = false;
      this.unavailable('Local recognition could not read the camera frame. Scanning still works.');
    }
  }

  /** Event-driven local analysis; never triggers an external AI upload. */
  requestAnalysis(): void { this.lastObjects = -Infinity; this.lastHands = -Infinity; }

  private unavailable(message: string): void {
    this.onStatus(message);
    this.stop();
    this.onFrame({ objects: [], pointing: null, selectedId: null });
  }

  stop(): void {
    this.running = false;
    this.busy = false;
    clearTimeout(this.timer); clearTimeout(this.watchdog);
    this.worker?.terminate(); this.worker = null;
    this.memory.clear(); this.selection.clear(); clearVisionObservations();
    this.pointing = null;
    this.hand = null;
    this.handCandidates = 0;
    this.lastObjects = -Infinity; this.lastHands = -Infinity; this.lastVideoTime = -1;
  }
}
