import { expect, test } from './fixtures/editor-page';

/**
 * Reproduces GitHub issue #103: cursor jumps to start when the editor
 * content is round-tripped through setJSON after every keystroke —
 * the exact flow that Angular signal forms trigger.
 *
 * @see https://github.com/Samyssmile/notectl/issues/103
 */
test.describe('Signal Form Cursor Reset (#103)', () => {
	test('cursor stays in place when setJSON round-trips unchanged content', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		// Type "Hello" one character at a time, round-tripping via setJSON after each keystroke
		for (const char of 'Hello') {
			await page.keyboard.type(char, { delay: 10 });
			await page.waitForTimeout(50);

			// Simulate signal form sync: read → write back identical content
			await page.evaluate(() => {
				const el = document.querySelector('notectl-editor') as HTMLElement & {
					getJSON(): unknown;
					setJSON(doc: unknown): void;
				};
				const doc = el.getJSON();
				el.setJSON(doc);
			});
			await page.waitForTimeout(50);
		}

		// Type a marker character — if cursor was preserved it appends; if reset it prepends
		await page.keyboard.type('!', { delay: 10 });

		const text: string = await editor.getText();
		expect(text.trim()).toBe('Hello!');
	});

	test('cursor stays at mid-word position after setJSON round-trip', async ({ editor, page }) => {
		await editor.typeText('abcdef');
		await page.waitForTimeout(50);

		// Move cursor to offset 3 (between 'c' and 'd')
		await page.keyboard.press('Home');
		await page.waitForTimeout(50);
		for (let i = 0; i < 3; i++) {
			await page.keyboard.press('ArrowRight');
		}
		await page.waitForTimeout(50);

		// Signal form round-trip
		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getJSON(): unknown;
				setJSON(doc: unknown): void;
			};
			el.setJSON(el.getJSON());
		});
		await page.waitForTimeout(50);

		// Type marker — should appear at offset 3, producing "abcXdef"
		await page.keyboard.type('X', { delay: 10 });

		const text: string = await editor.getText();
		expect(text.trim()).toBe('abcXdef');
	});

	test('multi-block editing preserves cursor across setJSON round-trips', async ({
		editor,
		page,
	}) => {
		await editor.typeText('First');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });
		await page.waitForTimeout(50);

		// Cursor is at the end of "Second" — round-trip via setJSON
		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getJSON(): unknown;
				setJSON(doc: unknown): void;
			};
			el.setJSON(el.getJSON());
		});
		await page.waitForTimeout(50);

		// Continue typing — should append to "Second", not jump to "First"
		await page.keyboard.type(' line', { delay: 10 });

		const text: string = await editor.getText();
		expect(text).toContain('Second line');
	});
});
