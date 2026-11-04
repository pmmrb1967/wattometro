// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The end-to-end check (pnpm test:e2e): the built app, served by `vite
 * preview`, in Chromium, on a phone and on a computer. It goes through the
 * demonstration, which runs in the browser and needs no API.
 * Build first (`pnpm build`); the CI does it before.
 */
import { defineConfig, devices } from '@playwright/test';

// Not 4173 (`vite preview` of another project may hold it, and would be reused).
const PORT = 4319;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Each page generates the demonstration's year in the browser: a few at a time.
  workers: process.env.CI ? 2 : 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' },
  projects: [
    { name: 'telemóvel', use: { ...devices['Pixel 7'] } },
    {
      name: 'computador',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
