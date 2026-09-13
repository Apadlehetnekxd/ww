import type { Region, VisionAnswer, VisionObject, VisionQuestion } from './types';

const observations = new Map<string, VisionObject>();
let lastSnapshot: { image: string; region: Region | null } | null = null;

export function rememberSceneObservations(objects: VisionObject[]): void {
  const now = Date.now();
  for (const object of objects) observations.set(object.id, object);
  for (const [id, object] of observations) if (now - object.lastSeen > 90000) observations.delete(id);
  const recent = [...observations.values()].sort((a, b) => a.lastSeen - b.lastSeen);
  while (observations.size > 32) observations.delete(recent.shift()!.id);
}

export function clearVisionObservations(): void { observations.clear(); lastSnapshot = null; }

/** Captures one relevant JPEG; this function never uploads the image. */
export function snapshotFrame(video: HTMLVideoElement, region?: Region): string {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error('Wait for the camera to become ready.');
  let x = 0, y = 0, width = video.videoWidth, height = video.videoHeight;
  let crop: Region | null = null;
  if (region && [region.x, region.y, region.width, region.height].every(Number.isFinite) && region.width > 0 && region.height > 0) {
    const padding = 0.09;
    const left = Math.max(0, Math.min(1, region.x - region.width * padding));
    const top = Math.max(0, Math.min(1, region.y - region.height * padding));
    const right = Math.min(1, region.x + region.width * (1 + padding));
    const bottom = Math.min(1, region.y + region.height * (1 + padding));
    if (right > left && bottom > top) {
      crop = { x: left, y: top, width: right - left, height: bottom - top };
      x = crop.x * video.videoWidth; y = crop.y * video.videoHeight;
      width = crop.width * video.videoWidth; height = crop.height * video.videoHeight;
    }
  }
  const scale = Math.min(1, 960 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This browser cannot capture a camera frame.');
  context.drawImage(video, x, y, width, height, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL('image/jpeg', 0.78);
  if (!image.startsWith('data:image/jpeg;base64,')) throw new Error('The camera frame could not be captured.');
  lastSnapshot = { image, region: crop };
  return image;
}

/** Called only after the UI has obtained consent for external visual analysis. */
export async function askVision(input: VisionQuestion): Promise<VisionAnswer> {
  const controller = new AbortController();
  const abort = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 48000);
  rememberSceneObservations(input.visibleObjects);
  try {
    const response = await fetch('/api/vision', {
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: input.question.trim().slice(0, 2000), image: input.image,
        imageRegion: lastSnapshot?.image === input.image ? lastSnapshot.region : null,
        selectedObject: input.selectedObject, visibleObjects: input.visibleObjects.slice(0, 16),
        pointingObject: input.pointingObject,
        previousObservations: [...observations.values()].filter((object) => Date.now() - object.lastSeen < 90000).slice(-32),
        history: input.history.slice(-12).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 3000) })),
      }),
    });
    const payload = await response.json().catch(() => null) as (VisionAnswer & { error?: string }) | null;
    if (!response.ok) throw new Error(payload?.error || 'Visual analysis is unavailable. Please try again.');
    if (!payload || typeof payload.answer !== 'string' || !payload.answer.trim()) throw new Error('Visual analysis returned no answer. Please try again.');
    return { answer: payload.answer, needsMoreInfo: typeof payload.needsMoreInfo === 'string' ? payload.needsMoreInfo : undefined,
      searchQuery: typeof payload.searchQuery === 'string' ? payload.searchQuery : undefined };
  } catch (error) {
    if (timedOut) throw new Error('Visual analysis took too long. Please try again.');
    throw error;
  } finally { clearTimeout(timeout); input.signal?.removeEventListener('abort', abort); }
}

/** An explicit external search, not a claim that the assistant has read results. */
export function searchObject(object: VisionObject): string {
  return `https://www.google.com/search?q=${encodeURIComponent(object.label.slice(0, 160))}`;
}
