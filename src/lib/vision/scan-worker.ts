import { ScanTracker } from './scan-tracker';
import type { ScanFrame } from './scan-tracker';

const tracker = new ScanTracker();
type BitmapFrame = Omit<ScanFrame, 'pixels'> & { bitmap: ImageBitmap };
const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<ScanFrame | BitmapFrame>) => void) | null; postMessage(message: unknown, transfer: Transferable[]): void };
let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
scope.onmessage = ({ data }) => {
  const start = performance.now();
  let input: ScanFrame;
  if ('bitmap' in data) {
    try {
      canvas ??= new OffscreenCanvas(data.width, data.height);
      context ??= canvas.getContext('2d', { willReadFrequently: true, alpha: false });
      if (!context) throw new Error('Worker frame processing unavailable');
      if (canvas.width !== data.width) canvas.width = data.width;
      if (canvas.height !== data.height) canvas.height = data.height;
      context.drawImage(data.bitmap, 0, 0, data.width, data.height);
      input = { ...data, pixels: context.getImageData(0, 0, data.width, data.height).data };
    } finally { data.bitmap.close(); }
  } else input = data;
  const observation = tracker.process(input);
  scope.postMessage({ ...observation, processingMs: performance.now() - start }, [observation.points.buffer, observation.pointIds.buffer]);
};
