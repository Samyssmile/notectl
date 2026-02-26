import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 1,
	workers: process.env.CI ? 4 : undefined,
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
			testIgnore: /angular|demo-showcase|touch/,
		},
		{
			name: 'angular',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4200',
			},
			testMatch: /angular\/.*\.spec\.ts/,
		},
		{
			name: 'firefox',
			use: {
				...devices['Desktop Firefox'],
				baseURL: 'http://localhost:3000',
			},
			testIgnore: /angular|demo-showcase|touch/,
		},
		{
			name: 'touch',
			use: {
				...devices['Pixel 5'],
				baseURL: 'http://localhost:3000',
			},
			testMatch: /touch.*\.spec\.ts/,
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
