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

	test('dead key accent composition produces correct character', async ({ editor, page }) => {
		await editor.focus();

		// Simulate a dead key accent: ´ + e → é
		await page.evaluate(() => {
			const el: HTMLElement | null =
				document.querySelector('notectl-editor')?.shadowRoot?.querySelector('.notectl-content') ??
				null;
			if (!el) return;

			// Dead key starts composition
			el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

			// Intermediate state shows the accent
			el.dispatchEvent(
				new InputEvent('beforeinput', {
					inputType: 'insertCompositionText',
					data: '\u00B4',
					bubbles: true,
					cancelable: true,
				}),
			);

			// User presses 'e' → composition resolves to é
			el.dispatchEvent(
				new InputEvent('beforeinput', {
					inputType: 'insertCompositionText',
					data: '\u00E9',
					bubbles: true,
					cancelable: true,
				}),
			);

			el.dispatchEvent(
				new CompositionEvent('compositionend', {
					data: '\u00E9',
					bubbles: true,
				}),
			);
		});

		await page.waitForTimeout(200);

		const text: string = await editor.getText();
		expect(text).toContain('\u00E9');
	});

	test('composition with stored marks applies marks to composed text', async ({ editor, page }) => {
		await editor.focus();

		// Type some text and toggle bold
		await editor.typeText('Hello ');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+b');
		await page.waitForTimeout(100);

		// Now simulate a composition (as if typing with IME while bold is active)
		await page.evaluate(() => {
			const el: HTMLElement | null =
				document.querySelector('notectl-editor')?.shadowRoot?.querySelector('.notectl-content') ??
				null;
			if (!el) return;

			el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

			el.dispatchEvent(
				new InputEvent('beforeinput', {
					inputType: 'insertCompositionText',
					data: 'W',
					bubbles: true,
					cancelable: true,
				}),
			);

			el.dispatchEvent(
				new CompositionEvent('compositionend', {
					data: 'W',
					bubbles: true,
				}),
			);
		});

		await page.waitForTimeout(200);

		const text: string = await editor.getText();
		expect(text).toContain('Hello');
		expect(text).toContain('W');

		// Check that the composed text has the bold mark
		const json = await editor.getJSON();
		const firstBlock = json.children[0];
		const children = firstBlock?.children ?? [];
		// Find the child containing 'W'
		const wChild = children.find((c: { text: string }) => c.text.includes('W'));
		if (wChild) {
			const hasBold: boolean =
				wChild.marks?.some((m: { type: string }) => m.type === 'bold') ?? false;
			expect(hasBold).toBe(true);
		}
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
