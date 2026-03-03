/**
 * Shared showcase document builder and normalization utilities
 * used by both the vanilla and Angular cut/paste roundtrip E2E tests.
 *
 * Builds the showcase document entirely via simulated user interactions
 * (toolbar clicks, popup selections, typing, keyboard shortcuts) to
 * exercise the full input → state → DOM pipeline.
 */
import type { Locator, Page } from '@playwright/test';

// ── Types ───────────────────────────────────────────────────────

export type JsonChild = {
	type: string;
	id?: string;
	children?: JsonChild[];
	attrs?: Record<string, unknown>;
	text?: string;
	marks?: { type: string; attrs?: Record<string, unknown> }[];
};

/** Minimal editor interface satisfied by both EditorPage and AngularEditorPage. */
export interface InteractionEditor {
	readonly root: Locator;
	readonly content: Locator;
	markButton(type: string): Locator;
	popup(): Locator;
	focus(): Promise<void>;
	getJSON(): Promise<{ children: JsonChild[] }>;
}

// ── Constants ───────────────────────────────────────────────────

/** 1×1 transparent PNG as data URI. */
const TINY_PNG_DATA_URI: string =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==';

const DELAY: number = 5;
const SETTLE: number = 100;

// ── Low-level Interaction Helpers ───────────────────────────────

async function typeText(page: Page, text: string): Promise<void> {
	await page.keyboard.type(text, { delay: DELAY });
}

async function selectBack(page: Page, chars: number): Promise<void> {
	for (let i = 0; i < chars; i++) {
		await page.keyboard.press('Shift+ArrowLeft');
	}
	await page.waitForTimeout(50);
}

async function clickButton(editor: InteractionEditor, id: string): Promise<void> {
	await editor.markButton(id).click();
}

async function pickHeading(editor: InteractionEditor, label: string): Promise<void> {
	await clickButton(editor, 'heading');
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
	await clickButton(editor, buttonId);
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
	await clickButton(editor, buttonId);
	const picker: Locator = editor.root.locator('.notectl-color-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-color-picker__swatch').first().click();
	await picker.waitFor({ state: 'hidden' });
	await page.waitForTimeout(SETTLE);
}

async function pickFont(editor: InteractionEditor, page: Page): Promise<void> {
	await clickButton(editor, 'font');
	const picker: Locator = editor.root.locator('.notectl-font-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-font-picker__item', { hasText: 'Fira Code' }).click();
	await picker.waitFor({ state: 'hidden' });
	await page.waitForTimeout(SETTLE);
}

async function pickFontSize(editor: InteractionEditor, page: Page): Promise<void> {
	await clickButton(editor, 'fontSize');
	const picker: Locator = editor.root.locator('.notectl-font-size-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-font-size-picker__item', { hasText: '24' }).click();
	await picker.waitFor({ state: 'hidden' });
	await page.waitForTimeout(SETTLE);
}

async function applyLink(editor: InteractionEditor, page: Page, url: string): Promise<void> {
	await clickButton(editor, 'link');
	const urlInput: Locator = editor.root.locator('input[aria-label="Link URL"]');
	await urlInput.waitFor({ state: 'visible' });
	await urlInput.fill(url);
	await editor.root.locator('button[aria-label="Apply link"]').click();
	await page.waitForTimeout(SETTLE);
}

async function insertImage(editor: InteractionEditor, page: Page): Promise<void> {
	await clickButton(editor, 'image');
	const urlInput: Locator = editor.root.locator('input[aria-label="Image URL"]');
	await urlInput.waitFor({ state: 'visible' });
	await urlInput.fill(TINY_PNG_DATA_URI);
	await editor.root.locator('button[aria-label="Insert image"]').click();
	await editor.root.locator('figure.notectl-image').waitFor({ state: 'visible', timeout: 5000 });
	await page.waitForTimeout(SETTLE);
}

async function insertTable(editor: InteractionEditor, page: Page): Promise<void> {
	await clickButton(editor, 'table');
	const picker: Locator = editor.root.locator('.notectl-grid-picker');
	await picker.waitFor({ state: 'visible' });
	await picker.locator('.notectl-grid-picker__cell[data-row="3"][data-col="3"]').click();
	await page.waitForTimeout(SETTLE);
}

// ── Marks Paragraph Builder ─────────────────────────────────────

async function buildMarksParagraph(editor: InteractionEditor, page: Page): Promise<void> {
	await typeText(page, 'This has ');

	// Simple toggle marks: activate → type → deactivate
	const toggleMarks: ReadonlyArray<readonly [string, string]> = [
		['bold', 'bold'],
		['italic', 'italic'],
		['underline', 'underlined'],
		['strikethrough', 'struck'],
		['superscript', 'super'],
		['subscript', 'sub'],
	];

	for (const [markId, text] of toggleMarks) {
		await clickButton(editor, markId);
		await typeText(page, text);
		await clickButton(editor, markId);
		await typeText(page, ', ');
	}

	// Link: type → select → apply via popup
	await typeText(page, 'linked');
	await selectBack(page, 6);
	await applyLink(editor, page, 'https://example.com');
	await page.keyboard.press('End');
	await typeText(page, ', ');

	// Text color: type → select → pick first swatch
	await typeText(page, 'colored');
	await selectBack(page, 7);
	await pickFirstColor(editor, page, 'textColor');
	await page.keyboard.press('End');
	await typeText(page, ', ');

	// Highlight: type → select → pick first swatch
	await typeText(page, 'highlighted');
	await selectBack(page, 11);
	await pickFirstColor(editor, page, 'highlight');
	await page.keyboard.press('End');
	await typeText(page, ', ');

	// Font: type → select → pick Fira Code
	await typeText(page, 'monospace');
	await selectBack(page, 9);
	await pickFont(editor, page);
	await page.keyboard.press('End');
	await typeText(page, ', and ');

	// Font size: type → select → pick 24
	await typeText(page, 'sized text');
	await selectBack(page, 10);
	await pickFontSize(editor, page);
	await page.keyboard.press('End');
	await typeText(page, '.');
}

// ── Main Builder ────────────────────────────────────────────────

/**
 * Builds a comprehensive showcase document entirely via simulated user
 * interactions: toolbar clicks, popup selections, typing, and keyboard
 * shortcuts. This exercises the full input → state → DOM pipeline.
 */
export async function buildShowcaseViaInteraction(
	page: Page,
	editor: InteractionEditor,
): Promise<void> {
	await editor.focus();

	// Block 1: H1 heading
	await pickHeading(editor, 'Heading 1');
	await typeText(page, 'Showcase Document');
	await page.keyboard.press('Enter');

	// Block 2: Inline marks paragraph
	await buildMarksParagraph(editor, page);
	await page.keyboard.press('Enter');

	// Block 3: H2 "Code Example"
	await pickHeading(editor, 'Heading 2');
	await typeText(page, 'Code Example');
	await page.keyboard.press('Enter');

	// Block 4: Code block
	await clickButton(editor, 'code_block');
	await typeText(page, 'const x = 42;');
	await page.keyboard.press('Control+Shift+Enter');

	// Block 5: H2 "Blockquote"
	await pickHeading(editor, 'Heading 2');
	await typeText(page, 'Blockquote');
	await page.keyboard.press('Enter');

	// Block 6: Blockquote
	await clickButton(editor, 'blockquote');
	await typeText(page, 'A wise observation.');
	await page.keyboard.press('Enter');
	await clickButton(editor, 'blockquote'); // toggle off → back to paragraph

	// Block 7: H2 "Lists"
	await pickHeading(editor, 'Heading 2');
	await typeText(page, 'Lists');
	await page.keyboard.press('Enter');

	// Blocks 8–9: Bullet list
	await clickButton(editor, 'list-bullet');
	await typeText(page, 'Bullet one');
	await page.keyboard.press('Enter');
	await typeText(page, 'Bullet two');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter'); // exit list

	// Blocks 10–11: Ordered list
	await clickButton(editor, 'list-ordered');
	await typeText(page, 'Ordered one');
	await page.keyboard.press('Enter');
	await typeText(page, 'Ordered two');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter'); // exit list

	// Blocks 12–13: Checklist
	await clickButton(editor, 'list-checklist');
	await typeText(page, 'Checked task');
	await page.keyboard.press('Enter');
	await typeText(page, 'Unchecked task');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter'); // exit list

	// Block 14: H2 "Table"
	await pickHeading(editor, 'Heading 2');
	await typeText(page, 'Table');
	await page.keyboard.press('Enter');

	// Block 15: Table 3×3
	await insertTable(editor, page);
	await typeText(page, 'Feature');
	await page.keyboard.press('Tab');
	await typeText(page, 'Status');
	await page.keyboard.press('Tab');
	await typeText(page, 'Owner');
	await page.keyboard.press('Tab');
	await typeText(page, 'Auth');
	await page.keyboard.press('Tab');
	await typeText(page, 'Done');
	await page.keyboard.press('Tab');
	await typeText(page, 'Alice');
	await page.keyboard.press('Tab');
	await typeText(page, 'UI');
	await page.keyboard.press('Tab');
	await typeText(page, 'WIP');
	await page.keyboard.press('Tab');
	await typeText(page, 'Bob');
	// Exit table: ArrowDown from last row moves below
	await page.keyboard.press('ArrowDown');
	await page.waitForTimeout(SETTLE);

	// Block 16: H2 "Layout"
	await pickHeading(editor, 'Heading 2');
	await typeText(page, 'Layout');
	await page.keyboard.press('Enter');

	// Block 17: Center-aligned paragraph
	await typeText(page, 'Center-aligned paragraph.');
	await pickDropdownItem(editor, 'alignment', 'Align Center');
	await page.keyboard.press('Enter');

	// Block 18: Right-aligned paragraph
	await typeText(page, 'Right-aligned paragraph.');
	await pickDropdownItem(editor, 'alignment', 'Align End');
	await page.keyboard.press('Enter');

	// Block 19: Justified paragraph
	await typeText(page, 'Justified paragraph with enough text.');
	await pickDropdownItem(editor, 'alignment', 'Justify');
	await page.keyboard.press('Enter');

	// Block 20: Horizontal rule
	await clickButton(editor, 'horizontal-rule');
	// HR inserts itself + trailing paragraph; cursor is in that paragraph

	// Block 21: H3 "RTL Text"
	await pickHeading(editor, 'Heading 3');
	await typeText(page, 'RTL Text');
	await page.keyboard.press('Enter');

	// Block 22: RTL paragraph
	await typeText(page, 'Hello World RTL.');
	await pickDropdownItem(editor, 'text-direction', 'Right to Left');
	await page.keyboard.press('Enter');

	// Block 23: Hard break paragraph
	await typeText(page, 'Line one');
	await page.keyboard.press('Shift+Enter');
	await typeText(page, 'Line two');
	await page.keyboard.press('Enter');

	// Block 24: Image
	await insertImage(editor, page);
}

// ── Cut/Paste Roundtrip ─────────────────────────────────────────

export async function performCutPasteRoundtrip(
	page: Page,
	editor: InteractionEditor,
): Promise<{ beforeJson: { children: JsonChild[] }; afterJson: { children: JsonChild[] } }> {
	await page.waitForTimeout(500);
	const beforeJson: { children: JsonChild[] } = await editor.getJSON();

	await editor.focus();
	await page.keyboard.press('Control+a');
	await page.waitForTimeout(100);
	await page.keyboard.press('Control+x');
	await page.waitForTimeout(200);
	await page.keyboard.press('Control+v');
	await page.waitForTimeout(500);

	const afterJson: { children: JsonChild[] } = await editor.getJSON();
	return { beforeJson, afterJson };
}

// ── Normalization ───────────────────────────────────────────────

/**
 * Recursively normalizes a JSON snapshot for comparison.
 *
 * Accounts for unavoidable browser-level transformations:
 * - **IDs regenerated**: Block IDs change on paste → strip `id` fields.
 * - **Hex → rgb()**: Browser serializes hex colors as `rgb()` in inline
 *   styles → convert hex to `rgb()` in the "before" snapshot.
 * - **Default attrs omitted**: `dir: 'auto'` and `align: 'start'` may be
 *   stripped after paste → remove them from both snapshots.
 * - **`undefined` values**: Strip keys with `undefined` values.
 * - **Mark ordering**: Sort marks arrays by type for order-independent comparison.
 * - **Empty trailing paragraphs**: The editor may add/remove trailing empty
 *   paragraphs after paste — these are stripped.
 * - **Empty text vs hard_break**: Clipboard roundtrip may convert empty text
 *   nodes to hard_break inline nodes in trailing empty blocks.
 */
export function normalize(obj: unknown): unknown {
	if (Array.isArray(obj)) {
		return obj.map((item) => normalize(item));
	}
	if (obj !== null && typeof obj === 'object') {
		const record = obj as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(record)) {
			if (key === 'id') continue;
			if (value === undefined) continue;

			// Strip default attribute values that may differ across paste
			if (key === 'dir' && value === 'auto') continue;
			if (key === 'align' && value === 'start') continue;
			if (key === 'backgroundColor' && value === '') continue;

			// Normalize color attrs: hex → rgb (browser clipboard behavior)
			if (key === 'color' && typeof value === 'string' && value.startsWith('#')) {
				result[key] = hexToRgb(value);
				continue;
			}

			// Sort marks arrays by type for order-independent comparison
			if (key === 'marks' && Array.isArray(value)) {
				const sorted = [...value]
					.map((m) => normalize(m) as Record<string, unknown>)
					.sort((a, b) => String(a.type ?? '').localeCompare(String(b.type ?? '')));
				result[key] = sorted;
				continue;
			}

			result[key] = normalize(value);
		}

		// Normalize empty-content children: an empty text node and a bare
		// hard_break inline are both representations of "empty block content"
		// produced by the clipboard roundtrip.  Canonicalize to hard_break.
		if (result.type === 'text' && result.text === '' && Array.isArray(result.marks)) {
			const marks = result.marks as unknown[];
			if (marks.length === 0) {
				return { type: 'inline', inlineType: 'hard_break', attrs: {} };
			}
		}

		// Strip `checked: false` from non-checklist list items — paste may
		// add/remove this default attribute on bullet/ordered items.
		if (result.type === 'list_item' && result.attrs !== undefined) {
			const attrs = result.attrs as Record<string, unknown>;
			if (attrs.listType !== 'checklist' && attrs.checked === false) {
				const { checked: _, ...rest } = attrs;
				result.attrs = rest;
			}
		}

		// Normalize children arrays: an empty array and a single-hard_break
		// array are equivalent after clipboard roundtrip.  Canonicalize to
		// empty array so both sides match.
		if (Array.isArray(result.children)) {
			const kids = result.children as unknown[];
			if (kids.length === 1) {
				const only = kids[0] as Record<string, unknown>;
				if (only.type === 'inline' && only.inlineType === 'hard_break') {
					result.children = [];
				}
			}
		}

		return result;
	}
	return obj;
}

/**
 * Top-level normalize that also strips trailing empty paragraphs which
 * the editor may add/remove across paste boundaries.
 */
export function normalizeDoc(doc: { children: JsonChild[] }): { children: unknown[] } {
	const children = doc.children.map((c) => normalize(c)) as Record<string, unknown>[];
	// Strip trailing empty paragraphs (single empty-text or hard_break child)
	while (children.length > 0) {
		const last: Record<string, unknown> = children[children.length - 1];
		if (last.type !== 'paragraph') break;
		const kids = last.children as unknown[] | undefined;
		if (!kids || kids.length > 1) break;
		if (kids.length === 0) {
			children.pop();
			continue;
		}
		const only = kids[0] as Record<string, unknown>;
		const isEmpty: boolean =
			(only.type === 'text' && only.text === '') ||
			(only.type === 'inline' && only.inlineType === 'hard_break');
		if (!isEmpty) break;
		children.pop();
	}
	return { children };
}

/** Converts a 3- or 6-digit hex color string to an `rgb(r, g, b)` string. */
function hexToRgb(hex: string): string {
	const h: string = hex.replace('#', '');
	const full: string = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	const r: number = Number.parseInt(full.substring(0, 2), 16);
	const g: number = Number.parseInt(full.substring(2, 4), 16);
	const b: number = Number.parseInt(full.substring(4, 6), 16);
	return `rgb(${r}, ${g}, ${b})`;
}
