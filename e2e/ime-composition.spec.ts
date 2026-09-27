import { expect, test } from './fixtures/editor-page';

/**
 * Deletions inside an active IME composition (#230).
 *
 * Android Gboard reports a backspace inside the composed word as
 * `deleteContentBackward` with `isComposing: true`. Playwright cannot drive an
 * Android IME, so this test dispatches the same event sequence. Synthetic
 * events have no default action: it verifies the editor's wiring (shared
 * composition tracker, blocked selection sync, re-render after the commit),
 * not the IME's DOM edits.
 */
test.describe('IME composition deletions (#230)', () => {
	/** Dispatches a composition that types `wo`, deletes `o` and commits `w`. */
	function composeWithBackspace(content: HTMLElement): void {
		const composing: InputEventInit = {
			isComposing: true,
			bubbles: true,
			cancelable: false,
			composed: true,
		};
		content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
		content.dispatchEvent(
			new InputEvent('beforeinput', {
				...composing,
				inputType: 'insertCompositionText',
				data: 'wo',
			}),
		);
		content.dispatchEvent(
			new InputEvent('beforeinput', { ...composing, inputType: 'deleteContentBackward' }),
		);
		content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'w' }));
	}

	test('backspace inside the composition keeps committed text', async ({ editor }) => {
		await editor.typeText('hello');

		await editor.content.evaluate(composeWithBackspace);

		const text = await editor.getText();
		expect(text.trim()).toBe('hellow');
	});
});
