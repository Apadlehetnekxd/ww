import { expect, test } from '@playwright/test';

test('the complete camera frame and tap targets fit a portrait screen without cutting off either side', async ({ page }) => {
  await page.goto('/vision');
  await expect(page.locator('video')).toBeAttached();
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite module import.
    const { frameToViewport, viewportToFrame } = await import('/src/lib/vision/coordinates.ts');
    const video = { videoWidth: 1920, videoHeight: 1080 };
    const bounds = new DOMRect(0, 0, 390, 844);
    const left = frameToViewport({ x: 0, y: .5 }, video, bounds);
    const right = frameToViewport({ x: 1, y: .5 }, video, bounds);
    const target = { x: .95, y: .25 };
    const restored = viewportToFrame(frameToViewport(target, video, bounds), video, bounds);
    return { left, right, restored, css: getComputedStyle(document.querySelector('video')!).objectFit };
  });
  expect(result.left.x).toBeCloseTo(0);
  expect(result.right.x).toBeCloseTo(390);
  expect(result.restored.x).toBeCloseTo(.95);
  expect(result.restored.y).toBeCloseTo(.25);
  expect(result.css).toBe('contain');
});

test('speech works independently of dictation, picks the loaded Hungarian voice and completes long replies', async ({ page }) => {
  await page.goto('/vision');
  const result = await page.evaluate(async () => {
    type Spoken = { text: string; lang: string; volume: number; voice: { lang: string } | null; onend: (() => void) | null; onstart: (() => void) | null; onerror: ((event: { error: string }) => void) | null };
    const queued: Spoken[] = [];
    let voices: { lang: string; localService: boolean }[] = [];
    let resumes = 0;
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => voices, speak: (utterance: Spoken) => { queued.push(utterance); utterance.onstart?.(); },
      cancel: () => {}, resume: () => { resumes++; },
    });
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class {
      text: string; lang = ''; volume = 1; voice = null; onend = null; onstart = null; onerror = null;
      constructor(text: string) { this.text = text; }
    }, configurable: true });
    // @ts-expect-error Browser-only Vite module import.
    const { VoiceService } = await import('/src/lib/vision/voice-service.ts');
    const service = new VoiceService();
    service.unlock();
    voices = [{ lang: 'hu-HU', localService: true }];
    synth.dispatchEvent(new Event('voiceschanged'));
    const failures: string[] = [];
    const text = 'Ez egy látható asztal. '.repeat(35).trim();
    service.speak(text, (error: string) => failures.push(error));
    let index = 1;
    while (index < queued.length && index < 30) { queued[index++].onend?.(); }
    const audible = queued.filter(item => item.volume > 0);
    const spokenText = audible.map(item => item.text).join(' ');
    const languages = audible.map(item => item.lang);
    const selected = audible.every(item => item.voice?.lang === 'hu-HU');
    service.speak('Ez egy új válasz.', (error: string) => failures.push(error));
    const last = queued.at(-1)!;
    last.onerror?.({ error: 'not-allowed' });
    service.stop();
    return { text, spokenText, languages, selected, resumes, chunks: audible.length, failures, stopped: last.onend === null };
  });
  expect(result.spokenText).toBe(result.text);
  expect(result.chunks).toBeGreaterThan(2);
  expect(result.languages.every((lang: string) => lang === 'hu-HU')).toBe(true);
  expect(result.selected).toBe(true);
  expect(result.resumes).toBeGreaterThan(0);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toContain('Read aloud');
  expect(result.stopped).toBe(true);
});
