import { Capacitor, registerPlugin } from '@capacitor/core';

type DepthPoint = { x: number; y: number; z: number };
type NativeLidar = {
  start(): Promise<{ available: boolean }>;
  stop(): Promise<void>;
  addListener(eventName: 'depthUpdate', listener: (event: { width: number; height: number; points: DepthPoint[] }) => void): Promise<{ remove: () => Promise<void> }>;
};

export const NativeLidar = registerPlugin<NativeLidar>('LidarDepth');
export const isNativeLidar = Capacitor.isNativePlatform();
