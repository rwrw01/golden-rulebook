import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3002',
    headless: true,
  },
});
