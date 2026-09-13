import { useEffect, useRef } from 'react';
import type { Point2 } from '@/lib/vision/types';

const connections = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];

/** Local hand landmarks join the white scan, with no box or screen-covering HUD. */
export function HandPoints({ hand, video }: { hand: Point2[] | null; video: HTMLVideoElement | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ hand, video });
  latest.current = { hand, video };
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    let frame = 0;
    let last = 0;
    let opacity = 0;
    let smoothed: Point2[] = [];
    const render = (time: number) => {
      const elapsed = last ? Math.min(50, time - last) : 16;
      last = time;
      const { hand, video } = latest.current;
      const bounds = element.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio, 2);
      const width = Math.round(bounds.width * dpr), height = Math.round(bounds.height * dpr);
      if (element.width !== width || element.height !== height) { element.width = width; element.height = height; }
      context.clearRect(0, 0, width, height);
      opacity += ((hand ? 1 : 0) - opacity) * (1 - Math.exp(-elapsed / 170));
      if (hand && video?.videoWidth) {
        const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
        const ease = 1 - Math.exp(-elapsed / 80);
        smoothed = hand.map((point, index) => {
          const next = { x: point.x * video.videoWidth * scale - (video.videoWidth * scale - width) / 2,
            y: point.y * video.videoHeight * scale - (video.videoHeight * scale - height) / 2 };
          const old = smoothed[index];
          return old ? { x: old.x + (next.x - old.x) * ease, y: old.y + (next.y - old.y) * ease } : next;
        });
      }
      if (smoothed.length === 21 && opacity > .01) {
        context.strokeStyle = `rgba(255,255,255,${opacity * .22})`;
        context.lineWidth = .7 * dpr;
        for (const chain of connections) {
          context.beginPath();
          chain.forEach((index, position) => { const point = smoothed[index]; if (position) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y); });
          context.stroke();
        }
        context.fillStyle = `rgba(255,255,255,${opacity * .9})`;
        for (const point of smoothed) { context.beginPath(); context.arc(point.x, point.y, 1.5 * dpr, 0, Math.PI * 2); context.fill(); }
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={canvas} className="vision-hand-points" aria-label={hand ? 'Hand detected' : 'Hand tracking'} />;
}
