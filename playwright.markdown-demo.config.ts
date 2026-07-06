import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated config for regenerating the Markdown guide's live-typing GIF
 * (`docs-site/src/assets/screenshots/markdown-live-typing.gif`).
 *
 * The spec is excluded from the normal e2e config; run it explicitly:
 *
 *   pnpm --filter @notectl/core build   # e2e serves the built dist/
 *   pnpm markdown-demo:record
 */
export default defineConfig({
	testDir: './e2e',
	testMatch: /markdown-typing-demo\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'line',
	timeout: 120_000,
	use: {
		baseURL: 'http://localhost:3000',
		...devices['Desktop Chrome'],
	},
	projects: [{ name: 'markdown-demo', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'pnpm --filter examples-vanillajs dev',
		url: 'http://localhost:3000',
		reuseExistingServer: true,
		timeout: 30_000,
	},
});
