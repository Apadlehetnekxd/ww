import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScanTracker } from '../src/lib/vision/scan-tracker.ts';

const width = 180;
const height = 240;
const worldWidth = 2600;
const world = new Uint8Array(worldWidth * height);
let seed = 71831;
for (let i = 0; i < world.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  world[i] = 35 + (seed % 190);
}

function frame(shift = 0, blank = false, orientation: number | null = null) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const value = blank ? 0 : world[y * worldWidth + x + shift];
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return { pixels, width, height, orientation, tilt: null, objectCoverage: 0 };
}

test('a stationary detailed image and device-orientation changes do not finish a scan', () => {
  const tracker = new ScanTracker();
  let result = tracker.process(frame());
  for (let i = 0; i < 90; i++) result = tracker.process(frame(0, false, i * 4));
  assert.equal(result.ready, false);
  assert.equal(result.metrics.viewpointCoverage, 0);
  assert.ok(result.metrics.stablePoints > 50);
  assert.ok(result.points.length / 4 > 2500, 'real static visual features still form a persistent map');
});

test('dark frames cannot generate a scan or points', () => {
  const tracker = new ScanTracker();
  let result = tracker.process(frame(0, true));
  for (let i = 0; i < 70; i++) result = tracker.process(frame(0, true, i * 5));
  assert.equal(result.ready, false);
  assert.equal(result.metrics.scanConfidence, 0);
  assert.equal(result.points.length, 0);
  assert.match(result.metrics.instruction, /light/);
});

test('tracked camera movement completes from repeated visual evidence without object detections', () => {
  const tracker = new ScanTracker();
  let result = tracker.process(frame());
  let previousConfidence = 0;
  for (let i = 0; i < 380; i++) {
    result = tracker.process({ ...frame(i * 2), timestamp: i * 100 });
    assert.ok(result.metrics.scanConfidence >= previousConfidence);
    previousConfidence = result.metrics.scanConfidence;
    if (i < 220) assert.equal(result.ready, false, 'a short look is insufficient for the detailed scan');
  }
  assert.ok(result.metrics.viewpointCoverage >= .6, JSON.stringify(result.metrics));
  assert.ok(result.metrics.objectCoverage > .5, JSON.stringify(result.metrics));
  assert.equal(result.ready, true, JSON.stringify(result.metrics));
  assert.ok(result.points.length / 4 > 4000);
});

test('lost visual evidence fades the accumulated point map', () => {
  const tracker = new ScanTracker();
  let result = tracker.process(frame());
  for (let i = 0; i < 30; i++) result = tracker.process(frame());
  const count = result.points.length;
  assert.ok(count > 0);
  for (let i = 0; i < 25; i++) result = tracker.process(frame(0, true));
  assert.equal(result.points.length, 0);
  assert.equal(result.ready, false);
});

test('small repeated shakes do not masquerade as new viewpoints', () => {
  const tracker = new ScanTracker();
  let result = tracker.process(frame());
  for (let i = 0; i < 100; i++) result = tracker.process(frame(Math.round(8 + Math.sin(i / 4) * 8)));
  assert.equal(result.ready, false);
  assert.ok(result.metrics.viewpointCoverage < .4);
});

test('a moving defocused scene cannot complete', () => {
  const tracker = new ScanTracker();
  let result = tracker.process(frame(0, true));
  for (let n = 0; n < 70; n++) {
    const input = frame();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const value = Math.round(100 + 50 * Math.sin((x + n * 2) / 40) * Math.cos(y / 35));
        input.pixels[index] = input.pixels[index + 1] = input.pixels[index + 2] = value;
      }
    }
    result = tracker.process(input);
  }
  assert.equal(result.ready, false);
  assert.ok(result.metrics.scanConfidence < .2);
});
