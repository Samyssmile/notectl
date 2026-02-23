import { expect, test } from '../fixtures/angular-editor-page';

test.describe('Angular — Theme Toggle', () => {
	test('theme toggle button is visible', async ({ editor }) => {
		await expect(editor.controlButton('Toggle Dark Mode')).toBeVisible();
	});

	test('clicking toggle switches to dark theme', async ({ editor }) => {
		await editor.controlButton('Toggle Dark Mode').click();

		await expect(editor.output).toContainText('Theme:');
		await expect(editor.output).toContainText('dark');
	});

	test('button label changes after toggle', async ({ editor }) => {
		await editor.controlButton('Toggle Dark Mode').click();
		await expect(editor.controlButton('Toggle Light Mode')).toBeVisible();
	});

	test('double toggle returns to light theme', async ({ editor }) => {
		await editor.controlButton('Toggle Dark Mode').click();
		await expect(editor.controlButton('Toggle Light Mode')).toBeVisible();

		await editor.controlButton('Toggle Light Mode').click();
		await expect(editor.output).toContainText('light');
		await expect(editor.controlButton('Toggle Dark Mode')).toBeVisible();
	});

	test('light theme applies --notectl-bg #ffffff', async ({ editor }) => {
		await expect(async () => {
			const bg: string = await editor.getThemeCSSVariable('--notectl-bg');
			// Browsers may return rgb(255, 255, 255) instead of #ffffff
			expect(bg === '#ffffff' || bg === 'rgb(255, 255, 255)').toBe(true);
		}).toPass({ timeout: 5_000 });
	});

	test('dark theme applies --notectl-bg #1e1e2e', async ({ editor }) => {
		await editor.controlButton('Toggle Dark Mode').click();

		await expect(async () => {
			const bg: string = await editor.getThemeCSSVariable('--notectl-bg');
			expect(bg === '#1e1e2e' || bg === 'rgb(30, 30, 46)').toBe(true);
		}).toPass({ timeout: 5_000 });
	});

	test('toggle back resets CSS variables to light', async ({ editor }) => {
		await editor.controlButton('Toggle Dark Mode').click();
		await editor.controlButton('Toggle Light Mode').click();

		await expect(async () => {
			const bg: string = await editor.getThemeCSSVariable('--notectl-bg');
			expect(bg === '#ffffff' || bg === 'rgb(255, 255, 255)').toBe(true);
		}).toPass({ timeout: 5_000 });
	});
});
