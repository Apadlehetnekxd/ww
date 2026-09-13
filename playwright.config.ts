import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', timeout: 45000,
  expect: { timeout: 10000 }, workers: 1, reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000', viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: { channel: existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'chrome' : undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: true, timeout: 60000 },
});
