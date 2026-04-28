import { expect, test } from './fixtures/editor-page';

/**
 * Companion spec to `signal-form-cursor.spec.ts`. Reproduces issue #103 for
 * the `contentFormat: 'html'` and `contentFormat: 'text'` Angular formField
 * paths, which round-trip through `setContentHTML(getContentHTML())` and
 * `setContentHTML('<p>${getText()}</p>')` respectively after every keystroke.
 *
 * The v2.0.9 fix preserves the caret across `replaceState()`, but only when
 * the new document keeps the original block IDs. The HTML parser generates
 * fresh block IDs on every parse, so the previous cursor's blockId no longer
 * exists and `EditorState.validateSelection()` falls back to (first leaf, 0).
 *
 * @see https://github.com/Samyssmile/notectl/issues/103
 */
test.describe('Signal Form Cursor Reset (#103) — html/text formats', () => {
	test('html round-trip: cursor stays in place when setContentHTML round-trips unchanged content', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		for (const char of 'Hello') {
			await page.keyboard.type(char, { delay: 10 });
			await page.waitForTimeout(50);

			await page.evaluate(async () => {
				const el = document.querySelector('notectl-editor') as HTMLElement & {
					getContentHTML(): Promise<string>;
					setContentHTML(html: string): Promise<void>;
				};
				const html: string = await el.getContentHTML();
				await el.setContentHTML(html);
			});
			await page.waitForTimeout(50);
		}

		await page.keyboard.type('!', { delay: 10 });

		const text: string = await editor.getText();
		expect(text.trim()).toBe('Hello!');
	});

	test('html round-trip: cursor stays at mid-word position', async ({ editor, page }) => {
		await editor.typeText('abcdef');
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.waitForTimeout(50);
		for (let i = 0; i < 3; i++) {
			await page.keyboard.press('ArrowRight');
		}
		await page.waitForTimeout(50);

		await page.evaluate(async () => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getContentHTML(): Promise<string>;
				setContentHTML(html: string): Promise<void>;
			};
			await el.setContentHTML(await el.getContentHTML());
		});
		await page.waitForTimeout(50);

		await page.keyboard.type('X', { delay: 10 });

		const text: string = await editor.getText();
		expect(text.trim()).toBe('abcXdef');
	});

	test('text round-trip: cursor stays in place across setText(getText()) round-trips', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		for (const char of 'Hello') {
			await page.keyboard.type(char, { delay: 10 });
			await page.waitForTimeout(50);

			// Mirrors `writeEditorValue` for `contentFormat: 'text'` after the #103
			// follow-up: reads via getText(), writes back via setText(). Block IDs
			// are reused, so replaceState() preserves the caret.
			await page.evaluate(() => {
				const el = document.querySelector('notectl-editor') as HTMLElement & {
					getText(): string;
					setText(value: string): void;
				};
				el.setText(el.getText());
			});
			await page.waitForTimeout(50);
		}

		await page.keyboard.type('!', { delay: 10 });

		const text: string = await editor.getText();
		expect(text.trim()).toBe('Hello!');
	});
});
