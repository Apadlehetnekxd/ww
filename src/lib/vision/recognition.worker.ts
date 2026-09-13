import { FilesetResolver, HandLandmarker, ObjectDetector } from '@mediapipe/tasks-vision';
import type { RecognitionWorkerRequest, RecognitionWorkerResponse } from './recognition-protocol';
import type { ObjectObservation } from './scene-memory';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const OBJECT_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let detector: ObjectDetector | null = null;
let hands: HandLandmarker | null = null;
let busy = false;
const send = (message: RecognitionWorkerResponse) => self.postMessage(message);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

async function modelBytes(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'force-cache', credentials: 'omit' });
    if (!response.ok) throw new Error('Model download failed');
    return new Uint8Array(await response.arrayBuffer());
  } finally { clearTimeout(timeout); }
}

async function initialize(): Promise<void> {
  // The module WASM loader is required in module workers. CPU inference avoids
  // competing with the point renderer for the phone's GPU.
  const files = await FilesetResolver.forVisionTasks(WASM_ROOT, true);
  try {
    detector = await ObjectDetector.createFromOptions(files, {
      canvas: new OffscreenCanvas(1, 1),
      baseOptions: { modelAssetBuffer: await modelBytes(OBJECT_MODEL), delegate: 'CPU' },
      runningMode: 'VIDEO', scoreThreshold: 0.48, maxResults: 16,
    });
  } catch {
    send({ type: 'status', message: 'Object recognition is unavailable. Camera scanning still works.' });
  }
  try {
    // Tasks Vision 1.0.1 clears its global WASM factory after each instance.
    // A distinct module URL re-evaluates the loader for the second model;
    // otherwise ESM caching causes "ModuleFactory not set" for hands.
    const handFiles = { ...files, wasmLoaderPath: `${files.wasmLoaderPath}?task=hands` };
    hands = await HandLandmarker.createFromOptions(handFiles, {
      canvas: new OffscreenCanvas(1, 1),
      baseOptions: { modelAssetBuffer: await modelBytes(HAND_MODEL), delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45, minTrackingConfidence: 0.45,
    });
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Neurix hand model initialization:', error);
    send({ type: 'status', message: 'Finger tracking is unavailable. You can still tap objects or ask about the camera view.' });
  }
  send({ type: 'ready', objects: !!detector, hands: !!hands });
}

self.onmessage = async (event: MessageEvent<RecognitionWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    try { await initialize(); }
    catch { send({ type: 'error', message: 'Local recognition could not load. Camera scanning still works.' }); }
    return;
  }
  if (busy) { message.bitmap.close(); return; }
  busy = true;
  const started = performance.now();
  const result: Extract<RecognitionWorkerResponse, { type: 'result' }> = { type: 'result', duration: 0 };
  try {
    if (message.objects && detector) {
      try {
        const detections = detector.detectForVideo(message.bitmap, message.timestamp).detections;
        result.observations = detections.flatMap((detection): ObjectObservation[] => {
          const box = detection.boundingBox, category = detection.categories[0];
          if (!box || !category?.categoryName || category.score < 0.48) return [];
          const x = clamp(box.originX / message.bitmap.width), y = clamp(box.originY / message.bitmap.height);
          const width = clamp((box.originX + box.width) / message.bitmap.width) - x;
          const height = clamp((box.originY + box.height) / message.bitmap.height) - y;
          if (width < 0.008 || height < 0.008) return [];
          const type = category.categoryName;
          // COCO's 'tv' category includes monitors; avoid claiming which one it is.
          const label = type === 'tv' ? 'Monitor' : type === 'cell phone' ? 'Phone'
            : type === 'laptop' ? 'Laptop' : type === 'dining table' ? 'Desk'
            : type === 'keyboard' ? 'Keyboard' : type === 'bottle' ? 'Bottle'
            : type.charAt(0).toUpperCase() + type.slice(1);
          return [{ type, label, confidence: category.score, region: { x, y, width, height } }];
        });
      } catch {
        detector.close(); detector = null;
        send({ type: 'status', message: 'Object recognition stopped on this device. Camera scanning still works.' });
        result.observations = [];
      }
    }
    if (message.hands && hands) {
      try { result.landmarks = hands.detectForVideo(message.bitmap, message.timestamp).landmarks; }
      catch {
        hands.close(); hands = null;
        send({ type: 'status', message: 'Finger tracking stopped on this device. Tap an object to select it.' });
        result.landmarks = [];
      }
    }
    result.duration = performance.now() - started;
    send(result);
  } finally { message.bitmap.close(); busy = false; }
};
