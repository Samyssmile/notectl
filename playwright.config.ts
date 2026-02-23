import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3000',
			},
			testIgnore: /angular/,
		},
		{
			name: 'angular',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4200',
			},
			testMatch: /angular\/.*\.spec\.ts/,
		},
	],
	webServer: [
		{
			command: 'pnpm --filter examples-vanillajs dev',
			url: 'http://localhost:3000',
			reuseExistingServer: !process.env.CI,
			timeout: 10000,
		},
		{
			command: 'pnpm --filter examples-angular start',
			url: 'http://localhost:4200',
			reuseExistingServer: !process.env.CI,
			timeout: 60000,
		},
	],
});
