import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated config for regenerating the README hero GIF (`e2e/demo.gif`).
 *
 * The demo spec is excluded from the normal e2e config; run it explicitly:
 *
 *   pnpm --filter @notectl/core build   # e2e serves the built dist/
 *   pnpm demo:record
 */
export default defineConfig({
	testDir: './e2e',
	testMatch: /demo-showcase\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'line',
	timeout: 240_000,
	use: {
		baseURL: 'http://localhost:3000',
		...devices['Desktop Chrome'],
	},
	projects: [{ name: 'demo', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'pnpm --filter examples-vanillajs dev',
		url: 'http://localhost:3000',
		reuseExistingServer: true,
		timeout: 30_000,
	},
});
