import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated config for regenerating documentation screenshots.
 *
 * The generator writes tracked files under `docs-site/src/assets/screenshots`
 * and is intentionally excluded from the regression-test configuration.
 */
export default defineConfig({
	testDir: './e2e',
	testMatch: /generate-screenshots\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'line',
	use: {
		baseURL: 'http://localhost:3000',
		...devices['Desktop Chrome'],
	},
	projects: [{ name: 'docs-screenshots', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'pnpm --filter examples-vanillajs dev',
		url: 'http://localhost:3000',
		reuseExistingServer: true,
		timeout: 30_000,
	},
});
