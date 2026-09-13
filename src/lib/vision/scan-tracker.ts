import type { ScanMetrics } from './types';

export type ScanFrame = {
  pixels: Uint8ClampedArray; width: number; height: number;
  orientation: number | null; tilt: number | null; objectCoverage: number;
  rotationRate?: number; acceleration?: number;
  timestamp?: number;
};
export type ScanObservation = { points: Float32Array; pointIds: Uint32Array; metrics: Omit<ScanMetrics, 'progress' | 'complete'>; ready: boolean };
type Track = { id: number; x: number; y: number; confidence: number; observations: number; strength: number };
type Surface = { id: number; x: number; y: number; confidence: number; luminance: number; edge: number };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const median = (values: number[]) => values.length ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : 0;
const columns = 12;
const rows = 16;

/** A temporary image-space map. Coordinates are visual observations, never measured depth. */
export class ScanTracker {
  private previous: Uint8Array | null = null;
  private width = 0;
  private height = 0;
  private anchors: Track[] = [];
  private surfaces: Surface[] = [];
  private coverage = new Float32Array(columns * rows);
  private poseX = 0;
  private poseY = 0;
  private views = new Set<string>();
  private previousOrientation: number | null = null;
  private previousTilt: number | null = null;
  private yaw = 0;
  private pitch = 0;
  private goodObservations = 0;
  private bestStability = 0;
  private bestConfidence = 0;
  private frame = 0;
  private offsetX = 0;
  private offsetY = 0;
  private previousStable = 0;
  private nextPointId = 1;
  private usefulMilliseconds = 0;
  private lastTimestamp: number | null = null;

  process(input: ScanFrame): ScanObservation {
    const { width, height, pixels } = input;
    const timestamp = input.timestamp ?? this.frame * 100;
    const evidenceDelta = this.lastTimestamp === null ? 0 : clamp(timestamp - this.lastTimestamp, 0, 150);
    this.lastTimestamp = timestamp;
    if (width !== this.width || height !== this.height) {
      this.previous = null;
      this.anchors = [];
      this.surfaces = [];
      this.width = width;
      this.height = height;
    }
    this.frame++;
    const gray = new Uint8Array(width * height);
    let light = 0;
    let texture = 0;
    let sharpness = 0;
    for (let p = 0; p < gray.length; p++) {
      const i = p * 4;
      gray[p] = (pixels[i] * 77 + pixels[i + 1] * 150 + pixels[i + 2] * 29) >> 8;
      light += gray[p];
    }
    light /= gray.length;
    let samples = 0;
    for (let y = 2; y < height - 2; y += 3) {
      for (let x = 2; x < width - 2; x += 3) {
        const i = y * width + x;
        texture += Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + width] - gray[i - width]);
        sharpness += Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width]);
        samples++;
      }
    }
    texture /= Math.max(1, samples);
    sharpness /= Math.max(1, samples);
    const quality = clamp((light - 8) / 28) * clamp((texture - 1.2) / 8) * clamp((sharpness - .8) / 5);
    const usable = quality > .2;
    const localCoverage = new Uint16Array(columns * rows);
    let stable = 0;
    let matched = 0;
    let coherence = 0;
    let motion = 0;
    const dxs: number[] = [];
    const dys: number[] = [];

    if (this.previous && usable) {
      // Sparse patch flow establishes the camera's dominant image displacement.
      const coarseX: number[] = [];
      const coarseY: number[] = [];
      for (let i = 0; i < this.anchors.length; i += Math.max(1, Math.floor(this.anchors.length / 54))) {
        const anchor = this.anchors[i];
        const match = this.matchPatch(gray, anchor.x, anchor.y, this.offsetX, this.offsetY, 7, 1);
        if (match && match.error < 23) { coarseX.push(match.dx); coarseY.push(match.dy); }
      }
      const predictionX = median(coarseX);
      const predictionY = median(coarseY);
      this.anchors = this.anchors.filter(anchor => {
        const match = this.matchPatch(gray, anchor.x, anchor.y, predictionX, predictionY, 2, 1);
        if (match && match.error < 24) {
          anchor.x += match.dx;
          anchor.y += match.dy;
          anchor.observations++;
          anchor.confidence = clamp(anchor.confidence + .045 * (1 - match.error / 30));
          matched++;
          dxs.push(match.dx);
          dys.push(match.dy);
          if (anchor.observations >= 6 && anchor.confidence > .35) {
            stable++;
            localCoverage[this.cell(anchor.x, anchor.y)]++;
          }
        } else {
          anchor.confidence *= .58;
        }
        return anchor.confidence > .045 && this.inside(anchor.x, anchor.y, 4);
      });
      this.offsetX = median(dxs);
      this.offsetY = median(dys);
      motion = Math.hypot(this.offsetX, this.offsetY);
      coherence = dxs.length ? dxs.filter((x, i) => Math.hypot(x - this.offsetX, dys[i] - this.offsetY) < 2.5).length / dxs.length : 0;
      const deviceTurning = (input.rotationRate ?? 0) > 18;
      const verifiedMotion = matched >= 16 && coherence > .55 && motion >= .65;
      if (verifiedMotion) {
        this.poseX += this.offsetX / width;
        this.poseY += this.offsetY / height;
        // Orientation and inertial motion corroborate optical flow; they never create views alone.
        if (input.orientation !== null && this.previousOrientation !== null) {
          const change = ((input.orientation - this.previousOrientation + 540) % 360) - 180;
          this.yaw += clamp(change, -8, 8);
        }
        if (input.tilt !== null && this.previousTilt !== null) this.pitch += clamp(input.tilt - this.previousTilt, -6, 6);
        if (deviceTurning) this.yaw += clamp((input.rotationRate ?? 0) / 40, 0, 4);
      }
      // Fast pans do not earn the same evidence as slow, repeated observations.
      if (stable >= 28 && coherence > .4 && motion < 7 && (input.rotationRate ?? 0) < 45) {
        this.goodObservations++;
        this.usefulMilliseconds += evidenceDelta;
        // Quantized displacement avoids earning coverage by shaking back and forth.
        const useOrientation = Math.abs(this.yaw) > 15 || Math.abs(this.pitch) > 12;
        this.views.add(useOrientation
          ? `o:${Math.round(this.yaw / 24)}:${Math.round(this.pitch / 22)}`
          : `v:${Math.round(this.poseX / .2)}:${Math.round(this.poseY / .2)}`);
        for (let i = 0; i < localCoverage.length; i++) {
          if (localCoverage[i] > 0) this.coverage[i] = Math.min(1, this.coverage[i] + Math.min(.14, localCoverage[i] * .028));
        }
      }
    } else {
      this.anchors = this.anchors.filter(anchor => (anchor.confidence *= .6) > .045);
      this.offsetX = 0;
      this.offsetY = 0;
    }

    this.previousOrientation = input.orientation;
    this.previousTilt = input.tilt;
    const stableRatio = stable / Math.max(80, this.anchors.length);
    const stability = clamp(stableRatio * 1.35) * quality;
    this.bestStability = Math.max(this.bestStability, stability);
    if (usable) this.discover(gray, quality);
    this.updateSurfaces(gray, usable, localCoverage, stability);
    this.previous = gray;

    // Sparse scenes can have empty walls: useful feature coverage is saturated at 70%.
    const sceneCoverage = clamp(this.coverage.reduce((sum, value) => sum + value, 0) / (this.coverage.length * .7));
    const viewpointCoverage = clamp((this.views.size - 1) / 5);
    // Repeated visual structure is valid context even when no semantic model recognizes a room.
    // About 30 seconds of usable, repeatedly tracked evidence. Pauses,
    // darkness and fast/blurred pans earn neither duration nor observations.
    const observationDepth = Math.min(clamp(this.goodObservations / 200), clamp(this.usefulMilliseconds / 30000));
    const visualContext = sceneCoverage * viewpointCoverage * this.bestStability * observationDepth;
    const objectCoverage = Math.max(clamp(input.objectCoverage), visualContext);
    const confidence = (sceneCoverage * .4 + viewpointCoverage * .25 + this.bestStability * .2 + objectCoverage * .15) * (.45 + .55 * Math.sqrt(observationDepth));
    this.bestConfidence = Math.max(this.bestConfidence, confidence);
    const ready = confidence >= .78 && sceneCoverage >= .62 && viewpointCoverage >= .6 && stable >= 40 && quality > .28 && observationDepth >= 1;
    const left = this.coverage.reduce((sum, value, i) => sum + (i % columns < columns / 2 ? value : 0), 0);
    const right = this.coverage.reduce((sum, value, i) => sum + (i % columns >= columns / 2 ? value : 0), 0);
    const edge = this.coverage.reduce((sum, value, i) => {
      const col = i % columns, row = Math.floor(i / columns);
      return sum + (col === 0 || col === columns - 1 || row === 0 || row === rows - 1 ? value : 0);
    }, 0);
    const centerBand = this.coverage.reduce((sum, value, i) => {
      const col = i % columns, row = Math.floor(i / columns);
      return sum + (col > 2 && col < columns - 3 && row > 3 && row < rows - 4 ? value : 0);
    }, 0);
    const lostFeatures = this.previousStable > 40 && stable < this.previousStable * .45 && motion < 1.4;
    this.previousStable = stable;
    let instruction = 'Move slowly around the room.';
    if (light < 22) instruction = 'More light would help me see this.';
    else if (quality < .2 || motion >= 7 || (input.rotationRate ?? 0) >= 45 || ((input.acceleration ?? 0) > 22 && quality < .45)) instruction = 'Move a little slower.';
    else if (centerBand / Math.max(.001, edge) > 3.2 && sceneCoverage > .28) instruction = 'Move slightly farther back.';
    else if (usable && texture < 5.5 && sceneCoverage < .22 && this.frame > 12) instruction = 'Move a little closer.';
    else if (lostFeatures && left < right) instruction = 'Move slightly to the left.';
    else if (lostFeatures) instruction = 'Show me this from another angle.';
    else if (texture < 4) instruction = 'Show me an area with more detail.';
    else if (sceneCoverage > .5 && viewpointCoverage < .8) instruction = 'Slowly turn to show the surrounding environment.';
    else if (sceneCoverage < .7 && this.goodObservations > 14) instruction = left < right ? 'Show me the area on your left.' : 'Show me the area on your right.';
    else if (viewpointCoverage >= .8 && sceneCoverage < .82) instruction = 'Show me the other side.';
    else if (!ready && sceneCoverage > .4) instruction = 'Move slowly to scan the rest of the room.';
    else if (ready) instruction = 'Environment understood';
    return {
      points: this.makePoints(),
      pointIds: new Uint32Array([...this.anchors.map(point => point.id), ...this.surfaces.map(point => point.id)]),
      ready,
      metrics: { scanConfidence: this.bestConfidence, sceneCoverage, viewpointCoverage, featureStability: stability, objectCoverage, instruction, stablePoints: stable },
    };
  }

  private inside(x: number, y: number, margin: number) { return x >= margin && y >= margin && x < this.width - margin && y < this.height - margin; }
  private cell(x: number, y: number) { return Math.min(rows - 1, Math.max(0, Math.floor(y / this.height * rows))) * columns + Math.min(columns - 1, Math.max(0, Math.floor(x / this.width * columns))); }

  private matchPatch(gray: Uint8Array, x: number, y: number, predictionX: number, predictionY: number, radius: number, step: number) {
    const previous = this.previous!;
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y, 3)) return null;
    let bestError = Infinity;
    let bestX = 0;
    let bestY = 0;
    for (let sy = -radius; sy <= radius; sy += step) {
      for (let sx = -radius; sx <= radius; sx += step) {
        const dx = Math.round(predictionX) + sx;
        const dy = Math.round(predictionY) + sy;
        if (!this.inside(x + dx, y + dy, 3)) continue;
        let error = 0;
        for (let py = -2; py <= 2; py += 2) {
          for (let px = -2; px <= 2; px += 2) {
            error += Math.abs(previous[(y + py) * this.width + x + px] - gray[(y + dy + py) * this.width + x + dx + px]);
          }
        }
        // Prefer no movement when identical repetitive patterns are ambiguous.
        error = error / 9 + Math.hypot(dx, dy) * .025;
        if (error < bestError) { bestError = error; bestX = dx; bestY = dy; }
      }
    }
    return Number.isFinite(bestError) ? { dx: bestX, dy: bestY, error: bestError } : null;
  }

  private discover(gray: Uint8Array, quality: number) {
    const bucketSize = 4;
    const bucketWidth = Math.ceil(this.width / bucketSize);
    const occupied = new Set(this.anchors.map(anchor => Math.floor(anchor.x / bucketSize) + Math.floor(anchor.y / bucketSize) * bucketWidth));
    const candidates: Array<{ x: number; y: number; strength: number; bucket: number }> = [];
    for (let y = 5; y < this.height - 5; y += bucketSize) {
      for (let x = 5; x < this.width - 5; x += bucketSize) {
        const bucket = Math.floor(x / bucketSize) + Math.floor(y / bucketSize) * bucketWidth;
        if (occupied.has(bucket)) continue;
        let best = 0; let bestX = x; let bestY = y;
        for (let oy = 0; oy < 5; oy += 2) {
          for (let ox = 0; ox < 5; ox += 2) {
            const i = (y + oy) * this.width + x + ox;
            const gx = Math.abs(gray[i + 1] - gray[i - 1]);
            const gy = Math.abs(gray[i + this.width] - gray[i - this.width]);
            const score = Math.min(gx, gy) * 1.3 + (gx + gy) * .25;
            if (score > best) { best = score; bestX = x + ox; bestY = y + oy; }
          }
        }
        if (best > 9 && this.inside(bestX, bestY, 5)) candidates.push({ x: bestX, y: bestY, strength: best, bucket });
      }
    }
    candidates.sort((a, b) => b.strength - a.strength);
    // A bounded number of newly observed features emerges on each useful frame.
    const budget = Math.min(this.frame < 5 ? 22 : 70, 1400 - this.anchors.length);
    for (const candidate of candidates.slice(0, Math.max(0, budget))) this.anchors.push({ id: this.nextPointId++, x: candidate.x, y: candidate.y, confidence: .08 * quality, observations: 1, strength: candidate.strength });
  }

  private edgeAt(gray: Uint8Array, x: number, y: number) {
    const i = y * this.width + x;
    const gx = Math.abs(gray[i + 1] - gray[i - 1]);
    const gy = Math.abs(gray[i + this.width] - gray[i - this.width]);
    return gx + gy;
  }

  private ridge(gray: Uint8Array, x: number, y: number, edge: number) {
    const i = y * this.width + x;
    const gx = gray[i + 1] - gray[i - 1];
    const gy = gray[i + this.width] - gray[i - this.width];
    const alongX = Math.abs(gx) >= Math.abs(gy);
    const neighbor = alongX
      ? this.edgeAt(gray, x + Math.sign(gx || 1), y)
      : this.edgeAt(gray, x, y + Math.sign(gy || 1));
    return edge >= neighbor;
  }

  private updateSurfaces(gray: Uint8Array, usable: boolean, localCoverage: Uint16Array, stability: number) {
    // Smooth surfaces need evidence nearby, not a corner in every tiny cell.
    const supported = new Uint8Array(columns * rows);
    for (let cell = 0; cell < supported.length; cell++) {
      const x = cell % columns, y = Math.floor(cell / columns);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx, cy = y + dy;
        if (cx >= 0 && cx < columns && cy >= 0 && cy < rows && localCoverage[cy * columns + cx] > 0 && this.coverage[cy * columns + cx] > .06) supported[cell] = 1;
      }
    }
    this.surfaces = this.surfaces.filter(point => {
      point.x += this.offsetX;
      point.y += this.offsetY;
      if (!this.inside(point.x, point.y, 3)) return false;
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      const luminance = gray[y * this.width + x];
      point.edge = this.edgeAt(gray, x, y);
      const agrees = usable && Math.abs(luminance - point.luminance) < 25 && supported[this.cell(point.x, point.y)] > 0;
      if (!usable) point.confidence *= .55;
      else point.confidence = agrees ? Math.min(.96, point.confidence + (point.edge > 18 ? .045 : .018)) : point.confidence * (point.edge > 16 ? .93 : .88);
      point.luminance = point.luminance * .7 + luminance * .3;
      return point.confidence > .02;
    });
    if (!usable || stability < .18) return;
    const spacing = 2;
    const bucketWidth = Math.ceil(this.width / spacing);
    const occupied = new Set(this.surfaces.map(point => Math.floor(point.x / spacing) + Math.floor(point.y / spacing) * bucketWidth));
    const budget = Math.round(400 + 1100 * stability);
    let added = 0;
    const offset = this.frame % 2;
    for (let y = 5 + offset; y < this.height - 5 && added < budget && this.surfaces.length < 60000; y += spacing) {
      for (let x = 5 + (this.frame % 2); x < this.width - 5 && added < budget && this.surfaces.length < 60000; x += spacing) {
        const cell = this.cell(x, y);
        if (!supported[cell]) continue;
        const bucket = Math.floor(x / spacing) + Math.floor(y / spacing) * bucketWidth;
        if (occupied.has(bucket)) continue;
        const luminance = gray[y * this.width + x];
        if (luminance < 8 || luminance > 250) continue;
        const edge = this.edgeAt(gray, x, y);
        const contour = edge > 14 && this.ridge(gray, x, y, edge);
        // Retain sparse interior samples too: recognizable surfaces need more
        // than outlines. Density still depends on repeated local evidence.
        if (!contour && (x + y + this.frame) % (edge > 5 ? 2 : 4) !== 0) continue;
        this.surfaces.push({ id: this.nextPointId++, x, y, confidence: contour ? .08 : .025, luminance, edge });
        occupied.add(bucket);
        added++;
      }
    }
  }

  private makePoints() {
    const points = new Float32Array((this.anchors.length + this.surfaces.length) * 4);
    let cursor = 0;
    for (const point of this.anchors) {
      const edge = clamp(point.strength / 70);
      points[cursor++] = point.x / this.width;
      points[cursor++] = point.y / this.height;
      points[cursor++] = Math.min(1, point.confidence * (.7 + edge * .5));
      points[cursor++] = .85 + edge * .9;
    }
    for (const point of this.surfaces) {
      const edge = clamp(point.edge / 36);
      points[cursor++] = point.x / this.width;
      points[cursor++] = point.y / this.height;
      points[cursor++] = Math.min(1, point.confidence * (.48 + edge * .8));
      points[cursor++] = 1.05 + edge * .9;
    }
    return points;
  }
}
