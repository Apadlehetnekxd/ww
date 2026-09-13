import type { Point2, Region } from './types';

function contain(video: Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'>, bounds: Pick<DOMRect, 'width' | 'height'>) {
  const scale = Math.min(bounds.width / video.videoWidth, bounds.height / video.videoHeight);
  return { scale, offsetX: (video.videoWidth * scale - bounds.width) / 2, offsetY: (video.videoHeight * scale - bounds.height) / 2 };
}

// Keep the complete camera frame visible: the scan, camera, hands and taps share this fit.
export function frameToViewport(point: Point2, video: HTMLVideoElement, bounds: DOMRect): Point2 {
  const { scale, offsetX, offsetY } = contain(video, bounds);
  return { x: point.x * video.videoWidth * scale - offsetX, y: point.y * video.videoHeight * scale - offsetY };
}

export function viewportToFrame(point: Point2, video: HTMLVideoElement, bounds: DOMRect): Point2 {
  const { scale, offsetX, offsetY } = contain(video, bounds);
  return { x: (point.x + offsetX) / (video.videoWidth * scale), y: (point.y + offsetY) / (video.videoHeight * scale) };
}

export function contains(region: Region, point: Point2) {
  return point.x >= region.x && point.x <= region.x + region.width && point.y >= region.y && point.y <= region.y + region.height;
}
