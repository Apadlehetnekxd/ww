import { expect, test } from '@playwright/test';
import { handleVisionRequest } from '../server/vision-handler';
import { PointingSelection, SceneMemory, pointingRayFromHand, rankPointingTarget } from '../src/lib/vision/scene-memory';
import type { VisionObject } from '../src/lib/vision/types';

const observation = { type: 'bottle', label: 'Bottle', confidence: 0.9, region: { x: 0.55, y: 0.3, width: 0.18, height: 0.35 } };
const object: VisionObject = { ...observation, id: 'object_1', observations: 2, firstSeen: 100, lastSeen: 200 };
const ray = { origin: { x: 0.2, y: 0.48 }, direction: { x: 1, y: 0 } };
// A short test JPEG marker-shaped payload satisfies the transport validator;
// no real camera image or external provider is used by deterministic tests.
const question = { question: 'What is this?', image: `data:image/jpeg;base64,/9j/${'A'.repeat(80)}==`, selectedObject: object,
  pointingObject: object, visibleObjects: [object], history: [], previousObservations: [object], imageRegion: null };
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('http://localhost/api/vision', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('temporary memory keeps a moving object identity and forgets stale screen locations', () => {
  const memory = new SceneMemory();
  const first = memory.update([observation], 1000)[0];
  const next = memory.update([{ ...observation, region: { ...observation.region, x: 0.60 } }], 2100)[0];
  expect(next.id).toBe(first.id);
  expect(next.observations).toBe(2);
  expect(next.region.x).toBeGreaterThan(first.region.x);
  expect(memory.visible(5000)).toEqual([]);
  expect(memory.recent(5000)).toHaveLength(1);
  const returned = memory.update([observation], 9000)[0];
  expect(returned.id).not.toBe(first.id);
  memory.clear();
  expect(memory.recent(9000)).toEqual([]);
});

test('two same-category objects in one frame never collapse into one identity', () => {
  const memory = new SceneMemory();
  const bottle2 = { ...observation, region: { ...observation.region, x: 0.1 } };
  const before = memory.update([observation, bottle2], 1000);
  const after = memory.update([bottle2, observation], 2000);
  expect(new Set(after.map((item) => item.id)).size).toBe(2);
  expect(after.find((item) => item.region.x > 0.4)?.id).toBe(before.find((item) => item.region.x > 0.4)?.id);
});

test('point targeting follows the extended ray and rejects objects behind the fingertip', () => {
  const behind = { ...object, id: 'behind', region: { x: 0.02, y: 0.42, width: 0.08, height: 0.1 } };
  const offRay = { ...object, id: 'off-ray', region: { x: 0.3, y: 0.8, width: 0.1, height: 0.1 } };
  expect(rankPointingTarget(ray, [behind, object, offRay], null)).toBe(object.id);
  expect(rankPointingTarget(ray, [behind, offRay], null)).toBeNull();
  expect(rankPointingTarget({ ...ray, direction: { x: -1, y: 0 } }, [object], null)).toBeNull();
});

test('point selection waits for a stable intention and releases when the hand disappears', () => {
  const selection = new PointingSelection();
  expect(selection.update(ray, [object], 1000)).toBeNull();
  expect(selection.update(ray, [object], 1200)).toBeNull();
  expect(selection.update(ray, [object], 1400)).toBe(object.id);
  expect(selection.update(null, [object], 1500)).toBe(object.id);
  expect(selection.update(null, [object], 2200)).toBeNull();
});

test('a straight index creates a ray while an open palm does not', () => {
  const hand = Array.from({ length: 21 }, () => ({ x: 0.3, y: 0.4 }));
  hand[0] = { x: 0.2, y: 0.5 };
  hand[5] = { x: 0.3, y: 0.5 }; hand[6] = { x: 0.4, y: 0.5 }; hand[8] = { x: 0.55, y: 0.5 };
  expect(pointingRayFromHand(hand)?.direction.x).toBeCloseTo(1);
  for (const tip of [12, 16, 20]) hand[tip] = { x: 0.65, y: 0.4 };
  expect(pointingRayFromHand(hand)).toBeNull();
});

test('API rejects cross-site requests, invalid inputs and oversized bodies before provider access', async () => {
  expect((await handleVisionRequest(new Request('http://localhost/api/vision'), {})).status).toBe(405);
  expect((await handleVisionRequest(request(question, { origin: 'https://other.example' }), {})).status).toBe(403);
  expect((await handleVisionRequest(request({ ...question, image: 'https://external.example/image.jpg' }), {})).status).toBe(400);
  expect((await handleVisionRequest(request({ ...question, visibleObjects: [{ ...object, region: { x: 0.8, y: 0.1, width: 0.5, height: 0.2 } }] }), {})).status).toBe(400);
  expect((await handleVisionRequest(request({ ...question, image: 'A'.repeat(1_600_001) }), {})).status).toBe(413);
});

test('vision analysis route is served by the app instead of a missing-page fallback', async ({ request }) => {
  const response = await request.post('/api/vision', { headers: { 'content-type': 'application/json' }, data: {} });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: 'Send a question, one JPEG camera image, and valid scene context.' });
});

test('API honestly reports server configuration rather than returning a fabricated analysis', async () => {
  const response = await handleVisionRequest(request(question), {});
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Visual AI is not configured. Set OPENROUTER_API_KEY and VISION_MODEL on the server.' });
});

test('AI request includes actual image, selection, pointing and memory, and retains continuation instruction', async () => {
  const originalFetch = globalThis.fetch;
  let sent: { model: string; messages: { role: string; content: unknown }[] } | undefined;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ answer: 'I can see a bottle, but cannot read its label.', needsMoreInfo: 'Show me the label.' }) } }] });
  };
  try {
    const response = await handleVisionRequest(request(question), { OPENROUTER_API_KEY: 'test-server-key', VISION_MODEL: 'test/vision-model' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ needsMoreInfo: 'Show me the label.' });
    expect(sent?.model).toBe('test/vision-model');
    expect(JSON.stringify(sent)).toContain(question.image);
    expect(JSON.stringify(sent)).toContain('previousObservations');
    expect(JSON.stringify(sent)).toContain('pointingObject');
    expect(JSON.stringify(sent)).not.toContain('test-server-key');
    expect(String(sent?.messages[0].content)).toContain('Never invent a brand');
  } finally { globalThis.fetch = originalFetch; }
});

test('real local models load in a worker and a blank frame produces no invented objects', async ({ page }) => {
  test.skip(process.env.RUN_VISION_MODEL_TEST !== '1', 'Opt-in network smoke test downloads official model weights.');
  test.setTimeout(120000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const worker = new Worker(new URL('/src/lib/vision/recognition.worker.ts', location.href), { type: 'module' });
    return new Promise<{ ready: unknown; result?: unknown; positiveHands?: number; error?: string }>((resolve) => {
      let ready: unknown;
      let blankResult: unknown;
      const timer = setTimeout(() => { worker.terminate(); resolve({ ready, error: 'Timed out' }); }, 100000);
      worker.onerror = (event) => { clearTimeout(timer); worker.terminate(); resolve({ ready, error: event.message }); };
      worker.onmessage = async (event) => {
        if (event.data.type === 'ready') {
          ready = event.data;
          const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
          canvas.getContext('2d')!.fillRect(0, 0, 320, 240);
          const bitmap = await createImageBitmap(canvas);
          worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now(), objects: true, hands: true }, [bitmap]);
        } else if (event.data.type === 'result' && !blankResult) {
          blankResult = event.data;
          // Official MediaPipe test photo; no user camera data leaves the device.
          const response = await fetch('https://storage.googleapis.com/mediapipe-assets/right_hands.jpg');
          const bitmap = await createImageBitmap(await response.blob());
          worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now(), objects: false, hands: true }, [bitmap]);
        } else if (event.data.type === 'result' || event.data.type === 'error') {
          clearTimeout(timer); worker.terminate();
          resolve({ ready, result: blankResult, positiveHands: event.data.landmarks?.length ?? 0 });
        }
      };
      worker.postMessage({ type: 'init' });
    });
  });
  expect(result.error).toBeUndefined();
  expect(result.ready).toMatchObject({ objects: true, hands: true });
  expect(result.result).toMatchObject({ type: 'result', observations: [], landmarks: [] });
  expect(result.positiveHands).toBeGreaterThan(0);
});
