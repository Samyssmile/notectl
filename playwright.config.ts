import { defineConfig, devices } from '@playwright/test';

/**
 * Spec files that exercise browser-specific behavior (contenteditable,
 * Selection API, beforeinput, Clipboard, DOM rendering, focus management)
 * and therefore must be validated on both Chromium AND Firefox.
 *
 * Tests not listed here run only on Chromium — add a spec here when it
 * covers behaviour that diverges between Gecko and Blink.
 */
const CROSS_BROWSER_SPECS: RegExp = new RegExp(
	[
		'basic-editing',
		'arrow-navigation',
		'movement-commands',
		'goal-column',
		'hard-break',
		'input-rules',
		'special-characters',
		'code-block',
		'marks',
		'history',
		'cut-paste-block-types',
		'table-cut-paste',
		'image-cut-paste',
		'table-editing',
		'table-deletion',
		'list-in-table',
		'checklist',
		'tab-key',
		'dom-move',
		'accessibility',
	].join('|'),
);

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
			testMatch: CROSS_BROWSER_SPECS,
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
