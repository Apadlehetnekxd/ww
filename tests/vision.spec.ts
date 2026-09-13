import { expect, test, type Page } from '@playwright/test';

type CameraFixture = {
  requests: MediaStreamConstraints[];
  tracks: MediaStreamTrack[];
  frames: number;
  stops: number;
  renders: number;
  scene: 'black' | 'room';
  failure: string | null;
};

declare global {
  interface Window { __visionCameraTest: CameraFixture }
}

async function installCamera(page: Page, failure: string | null = null) {
  // Keep real workers, image processing, rendering, and native media playback.
  // Semantic-model downloads are unrelated to these camera/scan lifecycle tests.
  await page.context().route('https://cdn.jsdelivr.net/**', route => route.abort());
  await page.context().route('https://storage.googleapis.com/mediapipe-models/**', route => route.abort());
  await page.addInitScript(({ failure }) => {
    const state: CameraFixture = {
      requests: [], tracks: [], frames: 0, stops: 0, renders: 0, scene: 'black', failure,
    };
    window.__visionCameraTest = state;
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
    const originalDraw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args) { state.renders++; return originalDraw.apply(this, args); };
    const mediaDevices = navigator.mediaDevices || {};
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        state.requests.push(constraints);
        if (state.failure) throw new DOMException('Camera fixture request failed', state.failure);
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        const scene = document.createElement('canvas');
        scene.width = 640;
        scene.height = 480;
        const image = scene.getContext('2d')!;
        // A deterministic room illustration provides genuine image corners,
        // edges, and texture. It contains no injected detection or scan data.
        image.fillStyle = '#c3c0b8'; image.fillRect(0, 0, 640, 480);
        image.fillStyle = '#73777c'; image.fillRect(0, 320, 640, 160);
        image.fillStyle = '#333942'; image.fillRect(52, 62, 150, 158);
        image.fillStyle = '#92b4c6'; image.fillRect(63, 73, 128, 136);
        image.fillStyle = '#333942'; image.fillRect(123, 73, 8, 136);
        image.fillRect(63, 137, 128, 8);
        image.fillStyle = '#735347'; image.fillRect(247, 285, 338, 24);
        image.fillRect(263, 309, 19, 131); image.fillRect(550, 309, 19, 131);
        image.fillStyle = '#282b30'; image.fillRect(349, 174, 155, 99);
        image.fillStyle = '#637c95'; image.fillRect(357, 182, 139, 81);
        image.fillStyle = '#282b30'; image.fillRect(419, 273, 16, 13);
        image.fillStyle = '#5b6e53'; image.fillRect(559, 176, 31, 95);
        image.fillStyle = '#a97751'; image.fillRect(549, 253, 51, 31);
        let seed = 413;
        for (let y = 5; y < 480; y += 12) {
          for (let x = 5; x < 640; x += 12) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const shade = 30 + (seed % 200);
            image.fillStyle = `rgb(${shade} ${shade} ${shade})`;
            image.fillRect(x, y, 4 + (seed % 4), 4 + ((seed >>> 3) % 4));
          }
        }
        const paint = () => {
          if (state.scene === 'room') ctx.drawImage(scene, 0, 0);
          else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 640, 480); }
          state.frames++;
        };
        paint();
        const stream = canvas.captureStream(30);
        const interval = window.setInterval(paint, 1000 / 30);
        for (const track of stream.getTracks()) {
          state.tracks.push(track);
          const stop = track.stop.bind(track);
          Object.defineProperty(track, 'stop', {
            value: () => {
              if (track.readyState !== 'ended') state.stops++;
              stop();
              window.clearInterval(interval);
            },
          });
        }
        return stream;
      },
    });
  }, { failure });
}

async function startScanning(page: Page) {
  await page.goto('/vision');
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'scanning');
  await expect(page.locator('video.vision-video')).toHaveJSProperty('videoWidth', 640);
}

async function waitForFrames(page: Page, count: number) {
  const initial = await page.evaluate(() => window.__visionCameraTest.frames);
  await expect.poll(() => page.evaluate(start => window.__visionCameraTest.frames - start, initial), {
    timeout: 15_000,
  }).toBeGreaterThanOrEqual(count);
}

test('starts on a black permission screen and never opens the camera automatically', async ({ page }) => {
  await installCamera(page);
  await page.goto('/vision');
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'permission');
  await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
  await expect(page.locator('.neurix-preloader')).toHaveCount(0);
  await expect(page.getByText(/Coder AI/i)).toHaveCount(0);
  expect(await page.evaluate(() => window.__visionCameraTest.requests)).toHaveLength(0);
  expect(await page.locator('.vision-app').evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe('rgb(0, 0, 0)');
  await page.screenshot({ path: 'test-results/vision-permission.png' });
});

for (const [failure, message] of [
  ['NotAllowedError', /Camera access is off/i],
  ['NotFoundError', /No camera was found/i],
] as const) {
  test(`handles ${failure} with a usable retry`, async ({ page }) => {
    await installCamera(page, failure);
    await page.goto('/vision');
    await page.getByRole('button', { name: 'Open camera', exact: true }).click();
    await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'error');
    await expect(page.getByText(message)).toBeVisible();
    const attempts = await page.evaluate(() => window.__visionCameraTest.requests.length);
    expect(attempts).toBeGreaterThan(0);
    await page.evaluate(() => { window.__visionCameraTest.failure = null; });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'scanning');
    expect(await page.evaluate(() => window.__visionCameraTest.requests.length)).toBeGreaterThan(attempts);
  });
}

test('scan progress requires image evidence and cannot complete from one stationary view', async ({ page }) => {
  test.setTimeout(45_000);
  await installCamera(page);
  await startScanning(page);
  const progress = page.getByRole('progressbar');
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  // Wait for real delivered frames: a timer-based scan would incorrectly move.
  await waitForFrames(page, 90);
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'scanning');
  await expect(page.locator('video.vision-video')).toHaveCSS('opacity', '1');
  await expect(page.locator('video.vision-video')).toHaveCSS('object-fit', 'cover');
  await page.evaluate(() => { window.__visionCameraTest.scene = 'room'; });
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), {
    timeout: 15_000,
  }).toBeGreaterThan(0);
  await waitForFrames(page, 120);
  const amount = Number(await progress.getAttribute('aria-valuenow'));
  expect(amount).toBeGreaterThan(0);
  expect(amount).toBeLessThan(100);
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'scanning');
  await expect(page.getByText('Environment understood', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__visionCameraTest.tracks.every(track => track.readyState === 'live'))).toBe(true);
  await page.screenshot({ path: 'test-results/vision-scan.png' });
});

test('stops camera tracks while hidden and starts a new stream only on resume', async ({ page }) => {
  await installCamera(page);
  await startScanning(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'paused');
  expect(await page.evaluate(() => window.__visionCameraTest.tracks.every(track => track.readyState === 'ended'))).toBe(true);
  const requests = await page.evaluate(() => window.__visionCameraTest.requests.length);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'paused');
  expect(await page.evaluate(() => window.__visionCameraTest.requests.length)).toBe(requests);
  await page.getByRole('button', { name: 'Resume camera', exact: true }).click();
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'scanning');
  expect(await page.evaluate(() => window.__visionCameraTest.requests.length)).toBeGreaterThan(requests);
  expect(await page.evaluate(() => window.__visionCameraTest.tracks.at(-1)?.readyState)).toBe('live');
});

test('the scan draws at display cadence independently of the 30 FPS camera and slow analysis', async ({ page }) => {
  await installCamera(page);
  await startScanning(page);
  await page.evaluate(() => { window.__visionCameraTest.scene = 'room'; });
  await waitForFrames(page, 45);
  const before = await page.evaluate(() => ({ frames: window.__visionCameraTest.frames, renders: window.__visionCameraTest.renders, time: performance.now() }));
  await waitForFrames(page, 60);
  const after = await page.evaluate(() => ({ frames: window.__visionCameraTest.frames, renders: window.__visionCameraTest.renders, time: performance.now() }));
  const fps = (after.renders - before.renders) * 1000 / (after.time - before.time);
  expect(fps).toBeGreaterThan(40);
  expect((after.renders - before.renders) / (after.frames - before.frames)).toBeGreaterThan(1.4);
  console.log(`Measured scan rendering: ${fps.toFixed(1)} FPS on test browser`);
});

test('unmounting Vision releases the camera and the menu links to Vision', async ({ page }) => {
  await installCamera(page);
  await page.goto('/chat');
  await expect(page.locator('.neurix-preloader')).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Neurix Vision', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Coder/i })).toHaveCount(0);
  await page.getByRole('link', { name: 'Neurix Vision', exact: true }).click();
  await expect(page).toHaveURL(/\/vision$/);
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'permission');
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await expect(page.locator('.vision-app')).toHaveAttribute('data-phase', 'scanning');
  expect(await page.evaluate(() => window.__visionCameraTest.tracks.at(-1)?.readyState)).toBe('live');
  // Browser Back uses the router's popstate transition, preserving this document
  // so track assertions verify React cleanup rather than browser tab teardown.
  await page.goBack();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.locator('.vision-app')).toHaveCount(0);
  expect(await page.evaluate(() => window.__visionCameraTest.tracks.every(track => track.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(() => window.__visionCameraTest.stops)).toBeGreaterThan(0);
  await page.goto('/coder');
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
});
