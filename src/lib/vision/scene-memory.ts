import type { Point2, PointingRay, Region, VisionObject } from './types';

export type ObjectObservation = { type: string; label: string; confidence: number; region: Region };

const center = (r: Region): Point2 => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);

export function regionOverlap(a: Region, b: Region): number {
  const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return intersection / Math.max(0.00001, a.width * a.height + b.width * b.height - intersection);
}

/** Session-only, approximate screen-space identity. This is not a persistent 3D map. */
export class SceneMemory {
  private objects = new Map<string, VisionObject>();
  private nextId = 1;

  update(observations: ObjectObservation[], now = Date.now()): VisionObject[] {
    const matched = new Set<string>();
    for (const observation of [...observations].sort((a, b) => b.confidence - a.confidence)) {
      let best: VisionObject | undefined;
      let bestScore = 0;
      for (const object of this.objects.values()) {
        if (matched.has(object.id) || object.type !== observation.type || now - object.lastSeen > 4000) continue;
        const overlap = regionOverlap(object.region, observation.region);
        const displacement = distance(center(object.region), center(observation.region));
        const scale = Math.sqrt(Math.max(object.region.width * object.region.height, 0.001));
        const areaRatio = observation.region.width * observation.region.height / Math.max(0.0001, object.region.width * object.region.height);
        if (areaRatio < 0.35 || areaRatio > 2.8 || (overlap < 0.12 && displacement > Math.min(0.16, scale * 0.65))) continue;
        const score = overlap * 0.8 + Math.max(0, 1 - displacement / 0.25) * 0.2;
        if (score > bestScore) { bestScore = score; best = object; }
      }
      const object: VisionObject = best ? {
        ...best, label: observation.label, lastSeen: now,
        observations: Math.min(10000, best.observations + 1),
        confidence: best.confidence * 0.3 + observation.confidence * 0.7,
        region: {
          x: best.region.x * 0.22 + observation.region.x * 0.78,
          y: best.region.y * 0.22 + observation.region.y * 0.78,
          width: best.region.width * 0.22 + observation.region.width * 0.78,
          height: best.region.height * 0.22 + observation.region.height * 0.78,
        },
      } : { ...observation, id: `object_${this.nextId++}`, firstSeen: now, lastSeen: now, observations: 1 };
      this.objects.set(object.id, object);
      matched.add(object.id);
    }
    for (const [id, object] of this.objects) {
      if (now - object.lastSeen > 90000) this.objects.delete(id);
    }
    const oldest = [...this.objects.values()].sort((a, b) => a.lastSeen - b.lastSeen);
    while (this.objects.size > 64) this.objects.delete(oldest.shift()!.id);
    return this.visible(now);
  }

  visible(now = Date.now()): VisionObject[] {
    return [...this.objects.values()].filter((object) => now - object.lastSeen < 2200)
      .sort((a, b) => b.confidence - a.confidence).slice(0, 16);
  }

  recent(now = Date.now()): VisionObject[] {
    return [...this.objects.values()].filter((object) => now - object.lastSeen < 90000)
      .sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 32);
  }

  clear(): void { this.objects.clear(); this.nextId = 1; }
}

type Landmark = Point2 & { z?: number };

/** Extend the index finger past its tip; decline a ray when its 2D direction is ambiguous. */
export function pointingRayFromHand(hand: Landmark[], aspect = 1): PointingRay | null {
  if (hand.length < 21) return null;
  const p = (i: number) => ({ x: hand[i].x * aspect, y: hand[i].y });
  const wrist = p(0), base = p(5), joint = p(6), tip = p(8);
  const segmentA = { x: joint.x - base.x, y: joint.y - base.y };
  const segmentB = { x: tip.x - joint.x, y: tip.y - joint.y };
  const a = Math.hypot(segmentA.x, segmentA.y), b = Math.hypot(segmentB.x, segmentB.y);
  const straightness = (segmentA.x * segmentB.x + segmentA.y * segmentB.y) / Math.max(0.0001, a * b);
  if (a < 0.012 || b < 0.025 || straightness < 0.65 || distance(wrist, tip) < distance(wrist, joint) * 1.1) return null;
  // An open hand is not a pointing gesture. At least two other fingers should be curled.
  const curled = [[10, 12], [14, 16], [18, 20]].filter(([pip, end]) => distance(wrist, p(end)) < distance(wrist, p(pip)) * 1.16).length;
  if (curled < 2) return null;
  const dx = hand[8].x - hand[6].x, dy = hand[8].y - hand[6].y;
  const length = Math.hypot(dx, dy);
  if (length < 0.025) return null;
  return { origin: { x: hand[8].x, y: hand[8].y }, direction: { x: dx / length, y: dy / length } };
}

function rayEntry(ray: PointingRay, r: Region): number | null {
  let near = 0, far = Infinity;
  for (const key of ['x', 'y'] as const) {
    const min = r[key], max = min + (key === 'x' ? r.width : r.height);
    const origin = ray.origin[key], direction = ray.direction[key];
    if (Math.abs(direction) < 0.00001) {
      if (origin < min || origin > max) return null;
    } else {
      const first = (min - origin) / direction, second = (max - origin) / direction;
      near = Math.max(near, Math.min(first, second));
      far = Math.min(far, Math.max(first, second));
      if (far < near) return null;
    }
  }
  return near;
}

export function rankPointingTarget(ray: PointingRay, objects: VisionObject[], previous: string | null, aspect = 1): string | null {
  const d = { x: ray.direction.x * aspect, y: ray.direction.y };
  const len = Math.hypot(d.x, d.y);
  if (!len) return null;
  d.x /= len; d.y /= len;
  let bestId: string | null = null, bestScore = -Infinity;
  for (const object of objects) {
    if (object.type === 'person') continue;
    const c = center(object.region);
    const delta = { x: (c.x - ray.origin.x) * aspect, y: c.y - ray.origin.y };
    const along = delta.x * d.x + delta.y * d.y;
    // A large box containing the fingertip must still have its centre ahead of the finger.
    if (along < 0.015) continue;
    const cross = Math.abs(delta.x * d.y - delta.y * d.x);
    const radius = Math.abs(d.y) * object.region.width * aspect / 2 + Math.abs(d.x) * object.region.height / 2;
    const gap = Math.max(0, cross - radius);
    const entry = rayEntry(ray, object.region);
    if (entry === null && gap > 0.065) continue;
    const score = (entry !== null ? 1.0 : 0.4) - gap * 5 - along * 0.25 + object.confidence * 0.3
      - object.region.width * object.region.height * 0.25 + (object.id === previous ? 0.18 : 0);
    if (score > bestScore) { bestId = object.id; bestScore = score; }
  }
  return bestId;
}

export class PointingSelection {
  private selected: string | null = null;
  private candidate: string | null = null;
  private since = 0;

  update(ray: PointingRay | null, objects: VisionObject[], now: number, aspect = 1): string | null {
    if (!objects.some((object) => object.id === this.selected)) this.selected = null;
    const candidate = ray ? rankPointingTarget(ray, objects, this.selected, aspect) : null;
    if (candidate !== this.candidate) { this.candidate = candidate; this.since = now; }
    if (now - this.since >= (candidate ? 320 : 650)) this.selected = candidate;
    return this.selected;
  }

  clear(): void { this.selected = null; this.candidate = null; this.since = 0; }
}
