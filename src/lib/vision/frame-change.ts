// A tiny local comparison gates follow-up requests; elapsed time alone never
// causes another upload. This is a view-change signal, not semantic certainty.
export function frameSignature(video: HTMLVideoElement): number[] {
  const canvas = document.createElement('canvas');
  canvas.width = 24; canvas.height = 18;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !video.videoWidth) return [];
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const signature: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) signature.push(pixels[i] * .299 + pixels[i + 1] * .587 + pixels[i + 2] * .114);
  return signature;
}

export function usefulViewChange(before: number[], after: number[]): boolean {
  if (!before.length || before.length !== after.length) return false;
  const mean = after.reduce((sum, value) => sum + value, 0) / after.length;
  const contrast = Math.sqrt(after.reduce((sum, value) => sum + (value - mean) ** 2, 0) / after.length);
  const difference = after.reduce((sum, value, i) => sum + Math.abs(value - before[i]), 0) / after.length;
  return mean > 24 && contrast > 18 && difference > 14;
}
