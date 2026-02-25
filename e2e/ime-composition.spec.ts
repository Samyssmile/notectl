import { expect, test } from './fixtures/editor-page';

test.describe('IME Composition', () => {
	test('composition start + end produces correct text', async ({ editor, page }) => {
		await editor.focus();

		// Simulate a composition session via page.evaluate
		await page.evaluate(() => {
			const el: HTMLElement | null =
				document.querySelector('notectl-editor')?.shadowRoot?.querySelector('.notectl-content') ??
				null;
			if (!el) return;

			el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

			// Simulate insertCompositionText (browser handles this during composition)
			el.dispatchEvent(
				new InputEvent('beforeinput', {
					inputType: 'insertCompositionText',
					data: '\u304B',
					bubbles: true,
					cancelable: true,
				}),
			);

			el.dispatchEvent(
				new CompositionEvent('compositionend', {
					data: '\u304B',
					bubbles: true,
				}),
			);
		});

		// Allow time for the editor to process the composition
		await page.waitForTimeout(200);

		const text: string = await editor.getText();
		// The composed character should appear in the editor
		expect(text).toContain('\u304B');
	});

	test('multiple composition sessions work correctly', async ({ editor, page }) => {
		await editor.focus();

		// First composition
		await page.evaluate(() => {
			const el: HTMLElement | null =
				document.querySelector('notectl-editor')?.shadowRoot?.querySelector('.notectl-content') ??
				null;
			if (!el) return;

			el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
			el.dispatchEvent(
				new CompositionEvent('compositionend', {
					data: 'A',
					bubbles: true,
				}),
			);
		});

		await page.waitForTimeout(100);

		// Second composition
		await page.evaluate(() => {
			const el: HTMLElement | null =
				document.querySelector('notectl-editor')?.shadowRoot?.querySelector('.notectl-content') ??
				null;
			if (!el) return;

			el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
			el.dispatchEvent(
				new CompositionEvent('compositionend', {
					data: 'B',
					bubbles: true,
				}),
			);
		});

		await page.waitForTimeout(200);

		const text: string = await editor.getText();
		expect(text).toContain('A');
		expect(text).toContain('B');
	});

	test('keyboard events are suppressed during composition', async ({ editor, page }) => {
		await editor.typeText('Hello');

		// Start composition
		await page.evaluate(() => {
			const el: HTMLElement | null =
				document.querySelector('notectl-editor')?.shadowRoot?.querySelector('.notectl-content') ??
				null;
			if (!el) return;

			el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

			// Dispatch a keydown that would normally trigger undo
			el.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'z',
					ctrlKey: true,
					bubbles: true,
					cancelable: true,
				}),
			);

			el.dispatchEvent(
				new CompositionEvent('compositionend', {
					data: 'X',
					bubbles: true,
				}),
			);
		});

		await page.waitForTimeout(200);

		const text: string = await editor.getText();
		// The text should contain both "Hello" and "X" — undo should not have fired
		expect(text).toContain('Hello');
		expect(text).toContain('X');
	});
});
