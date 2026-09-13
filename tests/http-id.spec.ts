import { test, expect } from '@playwright/test';

test('chat and image pages create UUIDs when native randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/chat');
  await expect(page.getByPlaceholder('Ask anything…').first()).toBeAttached();
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite serves this browser-only regression-test import.
    const { createId } = await import('/src/lib/create-id.ts');
    const ids = Array.from({ length: 256 }, () => createId());
    return { unique: new Set(ids).size, valid: ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) };
  });
  expect(result).toEqual({ unique: 256, valid: true });
  await page.goto('/image');
  await expect(page.getByText('Members only.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
