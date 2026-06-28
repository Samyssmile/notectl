/**
 * Document recipe for the README hero GIF (`e2e/demo.gif`).
 *
 * Types a believable Software Requirements Specification end to end via
 * simulated user interaction (toolbar clicks, popup choices, typing,
 * keyboard shortcuts). The prose is real so the recording reads like an
 * actual document, while still exercising every shipped plugin: headings,
 * inline marks, links, colors, highlight, fonts/sizes, super/subscript,
 * math formulas, code blocks, blockquotes, all three list kinds, tables,
 * alignment, horizontal rules, text direction, hard breaks, and images.
 *
 * The low-level interaction primitives are shared with the cut/paste
 * roundtrip fixture (`showcase-data.ts`) to keep a single source of truth.
 */
import type { Page } from '@playwright/test';
import {
	type InteractionEditor,
	applyLink,
	clickButton,
	insertTable,
	pickDropdownItem,
	pickFirstColor,
	pickFont,
	pickFontSize,
	pickHeading,
	selectBack,
	typeText,
} from './showcase-data';

/** Pause between major sections so a viewer can read each result. */
const SECTION_PAUSE: number = 400;

async function section(page: Page): Promise<void> {
	await page.waitForTimeout(SECTION_PAUSE);
}

/** Types a word wrapped in a toggle mark (bold, italic, superscript, …). */
async function toggled(
	editor: InteractionEditor,
	page: Page,
	markId: string,
	word: string,
): Promise<void> {
	await clickButton(editor, markId);
	await typeText(page, word);
	await clickButton(editor, markId);
}

/**
 * Types a word, selects it, applies a selection-based styler (link, color,
 * font, …), then collapses the caret back to the end to keep typing prose.
 */
async function styled(page: Page, word: string, apply: () => Promise<void>): Promise<void> {
	await typeText(page, word);
	await selectBack(page, word.length);
	await apply();
	await page.keyboard.press('End');
}

/** Types one list item then advances to the next line. */
async function listItem(page: Page, text: string): Promise<void> {
	await typeText(page, text);
	await page.keyboard.press('Enter');
}

/** Picks a specific swatch (by palette index) from a color/highlight popup. */
async function pickColor(
	editor: InteractionEditor,
	page: Page,
	buttonId: string,
	swatchIndex: number,
): Promise<void> {
	await clickButton(editor, buttonId);
	const picker = editor.root.locator('.notectl-color-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-color-picker__swatch').nth(swatchIndex).click();
	await picker.waitFor({ state: 'hidden' });
	await page.waitForTimeout(100);
}

/** Inserts an image from a data URI via the image toolbar popup. */
async function insertImage(editor: InteractionEditor, page: Page, dataUri: string): Promise<void> {
	await clickButton(editor, 'image');
	const urlInput = editor.root.locator('input[aria-label="Image URL"]');
	await urlInput.waitFor({ state: 'visible' });
	await urlInput.fill(dataUri);
	await editor.root.locator('button[aria-label="Insert image"]').click();
	await editor.root.locator('figure.notectl-image').waitFor({ state: 'visible', timeout: 5000 });
	await page.waitForTimeout(200);
}

/**
 * Types the full specification document into a freshly mounted editor.
 *
 * @param page      Playwright page driving the keyboard/mouse.
 * @param editor    Page-object wrapper around `<notectl-editor>`.
 * @param imageUri  Data URI of a real image used for the image block.
 */
export async function buildDemoDocument(
	page: Page,
	editor: InteractionEditor,
	imageUri: string,
): Promise<void> {
	await editor.focus();

	// Title + an enlarged subtitle line. Picker marks (font, size, color,
	// highlight) stay active until the block ends, so every picker-styled word
	// is placed LAST in its paragraph; only toggle marks (bold, italic, …) and
	// links are bleed-safe mid-sentence.
	await pickHeading(editor, 'Heading 1');
	await typeText(page, 'Software Requirements Specification');
	await page.keyboard.press('Enter');
	await styled(page, 'notectl editor, v2.0 (Draft)', () => pickFontSize(editor, page));
	await page.keyboard.press('Enter');
	await section(page);

	// Intro: bold + italic + link inline (bleed-safe); monospace font last.
	await typeText(page, 'This document specifies ');
	await toggled(editor, page, 'bold', 'notectl');
	await typeText(page, ', a ');
	await toggled(editor, page, 'italic', 'framework-agnostic');
	await typeText(page, ' rich text editor shipped as a Web Component. See the ');
	await styled(page, 'API reference', () => applyLink(editor, page, 'https://notectl.dev'));
	await typeText(page, ' for the full contract. Bootstrap it with ');
	await styled(page, 'createEditor()', () => pickFont(editor, page));
	await page.keyboard.press('Enter');
	await section(page);

	// 1. Scope: two short paragraphs, each ending in its picker mark.
	await pickHeading(editor, 'Heading 2');
	await typeText(page, '1. Scope');
	await page.keyboard.press('Enter');
	await typeText(page, 'The editor ');
	await toggled(editor, page, 'underline', 'shall');
	await typeText(page, ' support structured rich text on every framework. Accessibility stays ');
	await styled(page, 'non-negotiable.', () => pickFirstColor(editor, page, 'highlight'));
	await page.keyboard.press('Enter');
	await typeText(page, 'Legacy entry points such as ');
	await toggled(editor, page, 'strikethrough', 'setInnerHtml()');
	await typeText(page, ' are now ');
	await styled(page, 'deprecated.', () => pickColor(editor, page, 'textColor', 11)); // #ff0000
	await page.keyboard.press('Enter');
	await section(page);

	// 2. Functional Requirements: bullet, ordered, checklist.
	await pickHeading(editor, 'Heading 2');
	await typeText(page, '2. Functional Requirements');
	await page.keyboard.press('Enter');

	await clickButton(editor, 'list-bullet');
	await listItem(page, 'Inline marks: bold, italic, links, and color');
	await listItem(page, 'Block structure: headings, lists, quotes, tables');
	await listItem(page, 'Embedded images and math');
	await page.keyboard.press('Enter');

	await clickButton(editor, 'list-ordered');
	await listItem(page, 'Parse incoming HTML into the model');
	await listItem(page, 'Apply every edit as a transaction');
	await listItem(page, 'Reconcile changes to the DOM');
	await page.keyboard.press('Enter');

	await clickButton(editor, 'list-checklist');
	await listItem(page, 'Keyboard accessible');
	await listItem(page, 'CSP-safe styling');
	await page.keyboard.press('Enter');
	await section(page);

	// 3. Architecture: a JSON code block + blockquote. The ```json + space
	// markdown shortcut creates the block with the JSON language; bracket/quote
	// auto-pairing and overtype let the literal JSON be typed verbatim, and
	// Enter after `{}` produces the indented multi-line shape.
	await pickHeading(editor, 'Heading 2');
	await typeText(page, '3. Architecture');
	await page.keyboard.press('Enter');
	await typeText(page, 'The editor is configured declaratively:');
	await page.keyboard.press('Enter');
	await typeText(page, '```json ');
	await typeText(page, '{');
	await page.keyboard.press('Enter');
	await typeText(page, '"theme": "light",');
	await page.keyboard.press('Enter');
	await typeText(page, '"plugins": ["heading", "table", "formula"],');
	await page.keyboard.press('Enter');
	await typeText(page, '"autofocus": true');
	await page.keyboard.press('Control+Shift+Enter');
	await clickButton(editor, 'blockquote');
	await typeText(page, 'One editor, every framework.');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter'); // empty last child exits the quote
	await section(page);

	// 4. Performance Budget: inline + display formula, super/subscript.
	await pickHeading(editor, 'Heading 2');
	await typeText(page, '4. Performance Budget');
	await page.keyboard.press('Enter');
	await typeText(page, 'Each keystroke must reconcile within a single frame, ');
	await typeText(page, '$t \\leq 16$'); // inline math via input rule
	await typeText(page, ' ms. Diffing stays linear, never O(n');
	await toggled(editor, page, 'superscript', '2');
	await typeText(page, '), and we track p');
	await toggled(editor, page, 'subscript', '95');
	await typeText(page, ' latency.');
	await page.keyboard.press('Enter');
	await typeText(page, '$$\\frac{1000}{60} \\approx 16.7$$'); // display math block
	await page.keyboard.press('Enter');
	await section(page);

	// 5. Interface Contract: table.
	await pickHeading(editor, 'Heading 2');
	await typeText(page, '5. Interface Contract');
	await page.keyboard.press('Enter');
	await insertTable(editor, page);
	const cells: ReadonlyArray<string> = [
		'Method',
		'Returns',
		'Notes',
		'getJSON()',
		'Document',
		'snapshot',
		'setContentHTML()',
		'Promise',
		'async',
	];
	for (let i = 0; i < cells.length; i++) {
		await typeText(page, cells[i]);
		if (i < cells.length - 1) await page.keyboard.press('Tab');
	}
	await page.keyboard.press('ArrowDown');
	await section(page);

	// 6. Appendix: alignment, horizontal rule, direction, hard break, image.
	await pickHeading(editor, 'Heading 2');
	await typeText(page, '6. Appendix');
	await page.keyboard.press('Enter');

	await typeText(page, 'Figure 1. Editing pipeline.');
	await pickDropdownItem(editor, 'alignment', 'Align Center');
	await page.keyboard.press('Enter');

	await typeText(page, 'Approved by Engineering.');
	await pickDropdownItem(editor, 'alignment', 'Align End');
	await page.keyboard.press('Enter');

	await clickButton(editor, 'horizontal-rule');

	await typeText(page, 'Localized for right-to-left scripts.');
	await pickDropdownItem(editor, 'text-direction', 'Right to Left');
	await page.keyboard.press('Enter');

	await typeText(page, 'notectl team');
	await page.keyboard.press('Shift+Enter');
	await typeText(page, 'specs@notectl.dev');
	await page.keyboard.press('Enter');

	await insertImage(editor, page, imageUri);
	await page.keyboard.press('ArrowRight'); // deselect for a clean final frame
	await page.waitForTimeout(1200); // hold on the finished document
}
