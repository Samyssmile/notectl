/**
 * Builder for a comprehensive "complex document" that exercises every
 * non-video plugin in the full preset, driven exclusively through real
 * user interactions: typing, keyboard shortcuts, toolbar clicks, popups
 * and markdown input rules. No internal/private editor APIs are used.
 *
 * Marks are applied with bleed-free patterns, because notectl has no
 * mark-inclusivity concept (typing immediately after a marked span
 * re-derives that span's marks): toggle marks use enable/type/disable, and
 * each attribute/picker mark gets its own one-word paragraph so it has no
 * following text to bleed onto.
 */
import type { Locator, Page } from '@playwright/test';

export type JsonMark = { type: string; attrs?: Record<string, unknown> };
export type JsonChild = {
	type: string;
	id?: string;
	inlineType?: string;
	children?: JsonChild[];
	attrs?: Record<string, unknown>;
	text?: string;
	marks?: JsonMark[];
};

/** Minimal editor surface shared with the Playwright page object. */
export interface InteractionEditor {
	readonly root: Locator;
	readonly content: Locator;
	markButton(type: string): Locator;
	popup(): Locator;
	focus(): Promise<void>;
	getJSON(): Promise<{ children: JsonChild[] }>;
}

const DELAY = 5;
const SETTLE = 80;

// ── Low-level gestures ──────────────────────────────────────────

async function type(page: Page, text: string): Promise<void> {
	await page.keyboard.type(text, { delay: DELAY });
}

async function click(editor: InteractionEditor, id: string): Promise<void> {
	await editor.markButton(id).click();
}

/** Selects the last `len` characters back from the current cursor. */
async function selectBack(page: Page, len: number): Promise<void> {
	for (let i = 0; i < len; i++) await page.keyboard.press('Shift+ArrowLeft');
	await page.waitForTimeout(SETTLE);
}

/**
 * Formats a toggle mark the way a user does: enable it, type the word,
 * disable it. Toggling off explicitly resets the stored marks, so the
 * following separator is unmarked (no bleed).
 */
async function toggleMarkWord(
	editor: InteractionEditor,
	page: Page,
	markId: string,
	word: string,
): Promise<void> {
	await click(editor, markId);
	await type(page, word);
	await click(editor, markId);
	await type(page, ' ');
}

/**
 * Types a single word, selects it, and applies an attribute mark via its
 * picker/popup. Used to build one-word paragraphs so the applied mark has no
 * trailing text in the block to bleed onto.
 */
async function pickerMarkWord(page: Page, word: string, apply: () => Promise<void>): Promise<void> {
	await type(page, word);
	await selectBack(page, word.length);
	await apply();
}

async function pickHeading(editor: InteractionEditor, label: string): Promise<void> {
	await click(editor, 'heading');
	const picker: Locator = editor.root.locator('.notectl-heading-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.getByRole('option', { name: label, exact: true }).click();
	await picker.waitFor({ state: 'hidden' });
}

async function pickDropdownItem(
	editor: InteractionEditor,
	buttonId: string,
	itemText: string,
): Promise<void> {
	await click(editor, buttonId);
	const popup: Locator = editor.popup();
	await popup.waitFor({ state: 'visible' });
	await popup.locator('[role="menuitem"]', { hasText: itemText }).click();
	await popup.waitFor({ state: 'hidden' });
}

async function pickFirstColor(
	editor: InteractionEditor,
	page: Page,
	buttonId: string,
): Promise<void> {
	await click(editor, buttonId);
	const picker: Locator = editor.root.locator('.notectl-color-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-color-picker__swatch').first().click();
	await picker.waitFor({ state: 'hidden' });
	await page.waitForTimeout(SETTLE);
}

async function pickFont(editor: InteractionEditor, page: Page, name: string): Promise<void> {
	await click(editor, 'font');
	const picker: Locator = editor.root.locator('.notectl-font-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-font-picker__item', { hasText: name }).click();
	await picker.waitFor({ state: 'hidden' });
	await page.waitForTimeout(SETTLE);
}

async function pickFontSize(editor: InteractionEditor, page: Page, size: string): Promise<void> {
	await click(editor, 'fontSize');
	const picker: Locator = editor.root.locator('.notectl-font-size-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-font-size-picker__item', { hasText: size }).click();
	await picker.waitFor({ state: 'hidden' });
	await page.waitForTimeout(SETTLE);
}

async function applyLink(editor: InteractionEditor, page: Page, url: string): Promise<void> {
	await click(editor, 'link');
	const urlInput: Locator = editor.root.locator('input[aria-label="Link URL"]');
	await urlInput.waitFor({ state: 'visible' });
	await urlInput.fill(url);
	await editor.root.locator('button[aria-label="Apply link"]').click();
	await page.waitForTimeout(SETTLE);
}

async function insertInlineFormula(
	editor: InteractionEditor,
	page: Page,
	latex: string,
): Promise<void> {
	await editor.root.locator('[aria-label="Insert formula"]').click();
	const input: Locator = page.locator('.notectl-formula-editor__input');
	await input.waitFor({ state: 'visible' });
	await input.fill(latex);
	await page.locator('.notectl-formula-editor__btn--primary').click();
	await page.waitForTimeout(SETTLE);
}

async function insertDisplayFormula(
	editor: InteractionEditor,
	page: Page,
	latex: string,
): Promise<void> {
	await editor.root.locator('[aria-label="Insert formula"]').click();
	const input: Locator = page.locator('.notectl-formula-editor__input');
	await input.waitFor({ state: 'visible' });
	await page.locator('.notectl-formula-editor__toggle input[type="checkbox"]').check();
	await input.fill(latex);
	await page.locator('.notectl-formula-editor__btn--primary').click();
	await page.waitForTimeout(SETTLE);
}

async function insertImage(editor: InteractionEditor, page: Page, dataUri: string): Promise<void> {
	await click(editor, 'image');
	const urlInput: Locator = editor.root.locator('input[aria-label="Image URL"]');
	await urlInput.waitFor({ state: 'visible' });
	await urlInput.fill(dataUri);
	await editor.root.locator('button[aria-label="Insert image"]').click();
	await editor.root.locator('figure.notectl-image').waitFor({ state: 'visible', timeout: 5000 });
	await page.waitForTimeout(SETTLE);
}

async function insertTable2x2(editor: InteractionEditor, page: Page): Promise<void> {
	await click(editor, 'table');
	const picker: Locator = editor.root.locator('.notectl-grid-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-grid-picker__cell[data-row="2"][data-col="2"]').click();
	await page.waitForTimeout(SETTLE);
}

/** 1×1 transparent PNG (avoids network, deterministic 1×1 dimensions). */
export const TINY_PNG: string =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==';

// ── Marked paragraphs ──────────────────────────────────────────

/**
 * Paragraph exercising the seven toggle/shortcut marks, one per word, using
 * the enable/type/disable pattern. Resulting model: `Marks: bold`(bold)
 * ` italic`(italic) ... with unmarked single spaces between.
 */
async function buildToggleMarksParagraph(editor: InteractionEditor, page: Page): Promise<void> {
	await type(page, 'Marks: ');
	await toggleMarkWord(editor, page, 'bold', 'bold');
	await toggleMarkWord(editor, page, 'italic', 'italic');
	await toggleMarkWord(editor, page, 'underline', 'underline');
	await toggleMarkWord(editor, page, 'strikethrough', 'strike');
	await toggleMarkWord(editor, page, 'inline_code', 'code');
	await toggleMarkWord(editor, page, 'superscript', 'sup');
	await toggleMarkWord(editor, page, 'subscript', 'sub');
}

// ── Main builder ───────────────────────────────────────────────

/**
 * Builds the full complex document via simulated user interactions and
 * leaves the cursor in the trailing paragraph. Covers: heading, all inline
 * marks, inline + display formula, code block, blockquote, three list
 * types (incl. a checked item), table, alignment, horizontal rule, block
 * text direction, hard break and image.
 */
export async function buildComplexDocument(page: Page, editor: InteractionEditor): Promise<void> {
	await editor.focus();

	// 1. H1 title
	await pickHeading(editor, 'Heading 1');
	await type(page, 'Complex Document');
	await page.keyboard.press('Enter');

	// 2. Toggle/shortcut marks paragraph
	await buildToggleMarksParagraph(editor, page);
	await page.keyboard.press('Enter');

	// 3–7. Attribute (picker) marks — one word per paragraph so each applied
	// mark is isolated to its own block (no following text to bleed onto).
	await pickerMarkWord(page, 'red', () => pickFirstColor(editor, page, 'textColor'));
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await pickerMarkWord(page, 'yellow', () => pickFirstColor(editor, page, 'highlight'));
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await pickerMarkWord(page, 'firacode', () => pickFont(editor, page, 'Fira Code'));
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await pickerMarkWord(page, 'big', () => pickFontSize(editor, page, '24'));
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await pickerMarkWord(page, 'linky', () => applyLink(editor, page, 'https://example.com'));
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');

	// 8. Inline bidi isolation (bdi mark)
	await pickerMarkWord(page, 'shalom', () =>
		pickDropdownItem(editor, 'inline-direction', 'Inline RTL'),
	);
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');

	// 9. Inline formula paragraph
	await type(page, 'Euler ');
	await insertInlineFormula(editor, page, 'a^2+b^2');
	await page.keyboard.press('End');
	await type(page, ' theorem');
	await page.keyboard.press('Enter');

	// 6. Code block
	await click(editor, 'code_block');
	await type(page, 'const x = 42;');
	await page.keyboard.press('Control+Shift+Enter'); // insertAfter → trailing paragraph

	// 7. Blockquote (exit via double Enter on an empty trailing line)
	await click(editor, 'blockquote');
	await type(page, 'A wise note.');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	// 8. H2 "Lists"
	await pickHeading(editor, 'Heading 2');
	await type(page, 'Lists');
	await page.keyboard.press('Enter');

	// 9–10. Bullet list (toolbar)
	await click(editor, 'list-bullet');
	await type(page, 'Bullet one');
	await page.keyboard.press('Enter');
	await type(page, 'Bullet two');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter'); // exit list

	// 11–12. Ordered list (toolbar)
	await click(editor, 'list-ordered');
	await type(page, 'Ordered one');
	await page.keyboard.press('Enter');
	await type(page, 'Ordered two');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter'); // exit list

	// 13–14. Checklist via input rules ([x] checked, then unchecked)
	await type(page, '[x] Done thing');
	await page.keyboard.press('Enter');
	await type(page, 'Todo thing');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter'); // exit list

	// 15. H2 "Table"
	await pickHeading(editor, 'Heading 2');
	await type(page, 'Table');
	await page.keyboard.press('Enter');

	// 16. Table 2×2
	await insertTable2x2(editor, page);
	await type(page, 'Feature');
	await page.keyboard.press('Tab');
	await type(page, 'Status');
	await page.keyboard.press('Tab');
	await type(page, 'Auth');
	await page.keyboard.press('Tab');
	await type(page, 'Done');
	await page.keyboard.press('ArrowDown'); // leave table downward
	await page.waitForTimeout(SETTLE);

	// 17. Center-aligned paragraph
	await type(page, 'Centered paragraph.');
	await pickDropdownItem(editor, 'alignment', 'Align Center');
	await page.keyboard.press('Enter');

	// 18. Horizontal rule (inserts itself + trailing paragraph)
	await click(editor, 'horizontal-rule');

	// 19. RTL (block) paragraph
	await type(page, 'Right to left.');
	await pickDropdownItem(editor, 'text-direction', 'Right to Left');
	await page.keyboard.press('Enter');

	// 20. Hard-break paragraph
	await type(page, 'Line one');
	await page.keyboard.press('Shift+Enter');
	await type(page, 'Line two');
	await page.keyboard.press('Enter');

	// 21. Display formula
	await insertDisplayFormula(editor, page, 'x=\\frac{1}{2}');

	// 22. Image
	await insertImage(editor, page, TINY_PNG);

	await page.waitForTimeout(200);
}

// ── Model projection ───────────────────────────────────────────

/**
 * Projects a raw document model into a stable form for exact comparison:
 * - drops `id` (regenerated per render/paste)
 * - replaces the long, converter-specific `mathml` string with a boolean
 *   `mathml: true` so assertions stay robust to converter output changes.
 */
export function projectDoc(doc: { children: JsonChild[] }): { children: unknown[] } {
	return { children: doc.children.map((c) => projectNode(c)) };
}

function projectNode(node: JsonChild): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		if (key === 'id') continue;
		if (key === 'children') continue;
		if (key === 'attrs') {
			out.attrs = projectAttrs(value as Record<string, unknown>);
			continue;
		}
		out[key] = value;
	}
	if (Array.isArray(node.children)) {
		out.children = node.children.map((c) => projectNode(c));
	}
	return out;
}

function projectAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(attrs)) {
		if (key === 'mathml' && typeof value === 'string') {
			out.mathml = true;
			continue;
		}
		out[key] = value;
	}
	return out;
}

/** Flattens the block-type spine of a document (top level only). */
export function blockTypes(doc: { children: JsonChild[] }): string[] {
	return doc.children.map((c) => c.type);
}
