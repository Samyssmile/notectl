import { expect, test } from './fixtures/editor-page';

test.describe('API', () => {
	test('getJSON returns document JSON', async ({ editor }) => {
		await editor.typeText('Hello');
		const json = await editor.getJSON();
		expect(json.children).toHaveLength(1);
		expect(json.children[0].type).toBe('paragraph');
	});

	test('getJSON / setJSON roundtrip', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		const json = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getJSON(): { children: { children: { text: string; marks: { type: string }[] }[] }[] };
				setJSON(doc: unknown): void;
			};
			const doc = el.getJSON();
			el.setJSON(doc);
			return el.getJSON();
		});

		expect(json.children).toHaveLength(1);
		expect(json.children[0].children[0].text).toBe('Hello World');
		expect(json.children[0].children[0].marks).toContainEqual({ type: 'bold' });
	});

	test('getHTML returns HTML string', async ({ editor }) => {
		await editor.typeText('Hello');
		const html = await editor.getHTML();
		expect(html).toContain('<p>');
		expect(html).toContain('Hello');
	});

	test('getHTML includes formatting tags', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.press('Control+b');
		await page.keyboard.type('bold', { delay: 10 });
		await page.keyboard.press('Control+b');
		await page.keyboard.type(' normal', { delay: 10 });

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('bold');
		expect(html).toContain('normal');
	});

	test('setHTML parses HTML into document', async ({ editor }) => {
		await editor.setHTML('<p><strong>Bold</strong> and <em>italic</em></p>');

		const text = await editor.getText();
		expect(text).toContain('Bold');
		expect(text).toContain('italic');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
	});

	test('getText returns plain text', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.click('#btn-get-text');
		const output = await page.locator('#output').innerText();
		expect(output.trim()).toBe('Hello');
	});

	test('isEmpty returns correct value', async ({ editor, page }) => {
		await page.click('#btn-is-empty');
		let output = await page.locator('#output').innerText();
		expect(output).toContain('true');

		await editor.typeText('Hi');
		await page.click('#btn-is-empty');
		output = await page.locator('#output').innerText();
		expect(output).toContain('false');
	});

	test('API toggle bold', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.click('#btn-toggle-bold');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
	});

	test('can() returns correct capability checks', async ({ editor }) => {
		const checks = await editor.getCanChecks();
		expect(checks.bold).toBe(true);
		expect(checks.italic).toBe(true);
		expect(checks.underline).toBe(true);
		expect(checks.undo).toBe(false);
		expect(checks.redo).toBe(false);

		await editor.typeText('Hello');

		const undoRedoChecks = await editor.getCanChecks();
		expect(undoRedoChecks.undo).toBe(true);
		expect(undoRedoChecks.redo).toBe(false);
	});

	test('stateChange event fires on changes', async ({ editor }) => {
		await editor.registerStateChangeCounter();
		await editor.typeText('Hi');

		const count = await editor.getStateChangeCount();
		expect(count).toBeGreaterThan(0);
	});

	test('API undo/redo', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.click('#btn-undo');

		const text = await editor.getText();
		expect(text.trim()).toBe('');

		await page.click('#btn-redo');
		const text2 = await editor.getText();
		expect(text2.trim()).toBe('Hello');
	});

	test('destroy cleans up editor', async ({ editor, page }) => {
		await expect(editor.toolbar()).toBeVisible();

		const result = await page.evaluate(async () => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				destroy(): Promise<void>;
				getState(): unknown;
			};
			await el.destroy();
			try {
				el.getState();
				return { threw: false };
			} catch {
				return { threw: true };
			}
		});

		expect(result.threw).toBe(true);
		await expect(editor.toolbar()).toHaveCount(0);
	});
});
