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
});
