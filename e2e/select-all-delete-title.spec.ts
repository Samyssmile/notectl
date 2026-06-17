/**
 * Regression test for the "centered title is not cleared" bug.
 *
 * Selecting the whole document (Ctrl+A) and deleting it must collapse the
 * editor back to a single empty paragraph, so the placeholder reappears,
 * regardless of which block types or alignment the document held.
 *
 * Reported behaviour: with a centered `title` as the first block, Ctrl+A +
 * Backspace leaves the cursor inside an empty, still-centered title block.
 * The document is therefore not "empty" (`isEmpty() === false`) and the
 * placeholder never comes back.
 */

import type { EditorPage } from './fixtures/editor-page';
import { expect, test } from './fixtures/editor-page';

/** The user-reported document state, captured just before pressing Ctrl+A. */
const REPORTED_DOCUMENT = {
	children: [
		{
			id: 'block-fcad597a-2ad9-4cf3-af55-5c8496c9248a',
			type: 'title',
			children: [{ type: 'text', text: 'Hello World', marks: [] }],
			attrs: { align: 'center', dir: 'ltr' },
		},
		{
			id: 'block-a3d126cc-da6a-4a1a-9229-1192d2e768ba',
			type: 'paragraph',
			children: [{ type: 'text', text: 'The Beginning', marks: [] }],
			attrs: { align: 'start', dir: 'ltr' },
		},
		{
			id: 'block-a47a0f08-d69d-4ff0-8de0-0df9918df239',
			type: 'paragraph',
			children: [{ type: 'text', text: '', marks: [] }],
		},
	],
};

/** Executes a registered editor command by name via the public element API. */
async function execCommand(editor: EditorPage, name: string): Promise<boolean> {
	return editor.page.evaluate((cmd) => {
		const el = document.querySelector('notectl-editor') as unknown as {
			executeCommand(n: string): boolean;
		};
		return el.executeCommand(cmd);
	}, name);
}

/** Reads whether the content element currently shows the empty-state placeholder. */
async function hasEmptyPlaceholder(editor: EditorPage): Promise<boolean> {
	return editor.page.evaluate(() => {
		const root = document.querySelector('notectl-editor');
		const content = root?.shadowRoot?.querySelector('.notectl-content');
		return content?.classList.contains('notectl-content--empty') ?? false;
	});
}

/** Reads the public `isEmpty()` flag from the editor element. */
async function isEmpty(editor: EditorPage): Promise<boolean> {
	return editor.page.evaluate(() =>
		(document.querySelector('notectl-editor') as unknown as { isEmpty(): boolean }).isEmpty(),
	);
}

/**
 * Asserts the editor has been fully reset to the empty state: exactly one
 * empty paragraph, the empty flag set, and the placeholder visible.
 */
async function expectEmptyState(editor: EditorPage): Promise<void> {
	const json = await editor.getJSON();
	expect(json.children.length).toBe(1);
	expect(json.children[0]?.type).toBe('paragraph');
	expect((await editor.getText()).trim()).toBe('');
	expect(await isEmpty(editor)).toBe(true);
	expect(await hasEmptyPlaceholder(editor)).toBe(true);
}

test.describe('Select-all + delete with a title block', () => {
	test('keystroke flow: centered title + paragraph clears to empty placeholder', async ({
		editor,
		page,
	}) => {
		// Arrange. Reproduce the user's authoring steps on a fresh document.
		await editor.focus();

		// Center the first block, turn it into a Title, type the heading.
		await execCommand(editor, 'alignCenter');
		await execCommand(editor, 'setTitle');
		await page.keyboard.type('Hello World', { delay: 10 });

		// Next line: a left-aligned paragraph with body text.
		await page.keyboard.press('Enter');
		await execCommand(editor, 'alignStart');
		await execCommand(editor, 'setParagraph');
		await page.keyboard.type('The Beginning', { delay: 10 });

		// Intermediate state: a separate assertion so a setup regression cannot
		// be mistaken for the delete bug under test.
		const before = await editor.getJSON();
		expect(before.children.map((c) => c.type)).toEqual(['title', 'paragraph']);
		expect(editor.getBlockText(before, 0)).toBe('Hello World');
		expect(editor.getBlockText(before, 1)).toBe('The Beginning');

		// Act. Select everything and delete it.
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Backspace');

		// Assert. The document must be a single empty paragraph again.
		await expectEmptyState(editor);
	});

	test('exact reported document clears to empty placeholder', async ({ editor, page }) => {
		// Arrange. Seed the verbatim document state the user reported.
		await editor.setJSON(REPORTED_DOCUMENT);
		await editor.focus();

		// Act. Select everything and delete it.
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Backspace');

		// Assert. The document must be a single empty paragraph again.
		await expectEmptyState(editor);
	});

	test('undo restores the original document after clearing it', async ({ editor, page }) => {
		// Arrange. Seed the reported document and clear it.
		await editor.setJSON(REPORTED_DOCUMENT);
		await editor.focus();
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Backspace');
		await expectEmptyState(editor);

		// Act. Undo the clear.
		await page.keyboard.press('Control+z');

		// Assert. The original block types, alignment, and text come back intact.
		const json = await editor.getJSON();
		expect(json.children.map((c) => c.type)).toEqual(['title', 'paragraph', 'paragraph']);
		expect(editor.getBlockText(json, 0)).toBe('Hello World');
		expect(editor.getBlockText(json, 1)).toBe('The Beginning');
		expect(await isEmpty(editor)).toBe(false);
		expect(await hasEmptyPlaceholder(editor)).toBe(false);
	});
});
