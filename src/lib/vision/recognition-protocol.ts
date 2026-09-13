import type { ObjectObservation } from './scene-memory';
import type { Point2 } from './types';

export type RecognitionWorkerRequest =
  | { type: 'init' }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number; objects: boolean; hands: boolean };

export type RecognitionWorkerResponse =
  | { type: 'ready'; objects: boolean; hands: boolean }
  | { type: 'status'; message: string }
  | { type: 'result'; observations?: ObjectObservation[]; landmarks?: (Point2 & { z: number })[][]; duration: number }
  | { type: 'error'; message: string };
