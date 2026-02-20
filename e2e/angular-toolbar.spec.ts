import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E tests for the Angular integration (`@notectl/angular`).
 *
 * The DOM structure is:
 *   <ntl-editor> → <div #host> → <notectl-editor> (shadow DOM) → .notectl-content
 *
 * Playwright pierces shadow DOM by default, so CSS selectors work across boundaries.
 */

// --- Typed API surface of the inner `<notectl-editor>` custom element ---
interface EditorElement extends HTMLElement {
	getText(): string;
	getJSON(): EditorJSON;
	getState(): { selection: { anchor: { offset: number; blockId: string } } };
	executeCommand(name: string): boolean;
	pluginManager?: { plugins: Map<string, unknown> };
}

interface EditorJSON {
	children: {
		type: string;
		attrs?: Record<string, unknown>;
		children: { text: string; marks?: { type: string }[] }[];
	}[];
}

// --- Helpers ---

/** Returns the inner editor's JSON document. */
function getJSON(page: Page): Promise<EditorJSON> {
	return page.evaluate(() => {
		const el = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
		return (el as unknown as EditorElement).getJSON();
	});
}

/** Returns the inner editor's plain text content. */
function getText(page: Page): Promise<string> {
	return page.evaluate(() => {
		const el = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
		return (el as unknown as EditorElement).getText();
	});
}

/** Wait for the inner `<notectl-editor>` shadow DOM content area to be ready. */
async function waitForEditor(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const ntl = document.querySelector('ntl-editor');
			const inner = ntl?.querySelector('notectl-editor');
			return inner?.shadowRoot?.querySelector('.notectl-content') !== null;
		},
		{ timeout: 30000 },
	);
}

/** Locator for the contenteditable area. */
function contentLocator(page: Page) {
	return page.locator('ntl-editor notectl-editor div.notectl-content');
}

/** Locator for a toolbar button by its item id. */
function toolbarButton(page: Page, itemId: string) {
	return page.locator(`ntl-editor notectl-editor button[data-toolbar-item="${itemId}"]`);
}

// --- Test suites ---

test.describe('Angular Editor Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('editor renders with contenteditable area', async ({ page }) => {
		const angularHost = page.locator('ntl-editor');
		await expect(angularHost).toBeAttached();
		await expect(contentLocator(page)).toHaveAttribute('contenteditable', 'true');
	});

	test('toolbar renders with formatting buttons', async ({ page }) => {
		const toolbar = page.locator('ntl-editor notectl-editor [role="toolbar"]');
		await expect(toolbar).toBeAttached();
		await expect(toolbarButton(page, 'bold')).toBeAttached();
		await expect(toolbarButton(page, 'italic')).toBeAttached();
		await expect(toolbarButton(page, 'underline')).toBeAttached();
	});

	test('type text into editor', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Hello Angular', { delay: 10 });

		const text = await getText(page);
		expect(text.trim()).toBe('Hello Angular');
	});

	test('make text bold via toolbar', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Bold text', { delay: 10 });

		await page.keyboard.press('Control+a');
		await toolbarButton(page, 'bold').click();

		const json = await getJSON(page);
		const hasBold = json.children[0]?.children.some((child) =>
			child.marks?.some((m) => m.type === 'bold'),
		);
		expect(hasBold).toBe(true);
	});

	test('all plugins registered', async ({ page }) => {
		const pluginCount = await page.evaluate(() => {
			const inner = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
			if (!inner) return 0;
			const pm = (inner as unknown as Record<string, unknown>).pluginManager as
				| Record<string, unknown>
				| undefined;
			if (!pm) return 0;
			const plugins = pm.plugins as Map<string, unknown> | undefined;
			return plugins instanceof Map ? plugins.size : 0;
		});

		expect(pluginCount).toBeGreaterThanOrEqual(15);
	});
});

test.describe('Angular — Headings & Block Types', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('create heading via input rule', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Main Title', { delay: 10 });

		const json = await getJSON(page);
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(1);
		const text = await getText(page);
		expect(text).toContain('Main Title');
	});

	test('create heading level 2 via input rule', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('## ', { delay: 10 });
		await page.keyboard.type('Subtitle', { delay: 10 });

		const json = await getJSON(page);
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(2);
	});

	test('create blockquote via input rule', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('A famous quote', { delay: 10 });

		const json = await getJSON(page);
		expect(json.children[0]?.type).toBe('blockquote');
		const text = await getText(page);
		expect(text).toContain('A famous quote');
	});

	test('create bullet list via input rule', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('First item', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second item', { delay: 10 });

		const json = await getJSON(page);
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('bullet');
		expect(json.children.length).toBeGreaterThanOrEqual(2);
	});

	test('create ordered list via input rule', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('Step one', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Step two', { delay: 10 });

		const json = await getJSON(page);
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('ordered');
	});

	test('create horizontal rule via input rule', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Some text', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('--- ', { delay: 10 });

		const json = await getJSON(page);
		const types = json.children.map((c) => c.type);
		expect(types).toContain('horizontal_rule');
	});
});

test.describe('Angular — Text Formatting', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('undo and redo text', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Hello World', { delay: 10 });

		// Undo
		await page.keyboard.press('Control+z');
		let text = await getText(page);
		expect(text.trim()).not.toBe('Hello World');

		// Redo
		await page.keyboard.press('Control+Shift+z');
		text = await getText(page);
		expect(text.trim()).toBe('Hello World');
	});
});

test.describe('Angular — Table Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('insert table via toolbar', async ({ page }) => {
		await contentLocator(page).click();
		await toolbarButton(page, 'table').click();

		// The table button opens a size picker grid — click a cell to select dimensions
		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="3"][data-col="3"]');
		await gridCell.click();

		const json = await getJSON(page);
		const types = json.children.map((c) => c.type);
		expect(types).toContain('table');
	});

	test('table has correct structure in DOM', async ({ page }) => {
		await contentLocator(page).click();
		await toolbarButton(page, 'table').click();

		// Select a 3x2 table from the size picker grid
		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="3"][data-col="2"]');
		await gridCell.click();

		// Table should render with rows and cells inside shadow DOM
		const tableEl = page.locator('ntl-editor notectl-editor table');
		await expect(tableEl).toBeAttached();

		const rows = tableEl.locator('tr');
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(2);
	});
});

test.describe('Angular — Font & FontSize Plugins', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('FontPlugin toolbar button visible and popup shows fonts', async ({ page }) => {
		const fontBtn = toolbarButton(page, 'font');
		await expect(fontBtn).toBeAttached();

		await fontBtn.click();
		const popup = page.locator('ntl-editor notectl-editor .notectl-font-picker');
		await expect(popup).toBeVisible();

		// STARTER_FONTS (2) + INTER = 3 fonts
		const items = popup.locator('.notectl-font-picker__item');
		const count = await items.count();
		expect(count).toBe(3);
	});

	test('FontSizePlugin toolbar button visible and popup shows sizes', async ({ page }) => {
		const sizeBtn = toolbarButton(page, 'fontSize');
		await expect(sizeBtn).toBeAttached();

		await sizeBtn.click();
		const popup = page.locator('ntl-editor notectl-editor .notectl-font-size-picker');
		await expect(popup).toBeVisible();

		const items = popup.locator('.notectl-font-size-picker__item');
		const count = await items.count();
		expect(count).toBe(5);

		// Items may include a checkmark on the active size, so check text content loosely
		const allText = await popup.innerText();
		expect(allText).toContain('12');
		expect(allText).toContain('16');
		expect(allText).toContain('24');
		expect(allText).toContain('32');
		expect(allText).toContain('48');
	});

	test('change font and font size, verify in JSON output', async ({ page }) => {
		const content = contentLocator(page);
		await content.click();
		await page.keyboard.type('Lorem ipsum dolor sit amet', { delay: 10 });

		// Select all text
		await page.keyboard.press('Control+a');

		// Open font popup and select second font (non-default)
		const fontBtn = toolbarButton(page, 'font');
		await fontBtn.click();
		const fontPopup = page.locator('ntl-editor notectl-editor .notectl-font-picker');
		await fontPopup.locator('.notectl-font-picker__item').nth(1).click();

		// Verify font mark in JSON
		let json = await getJSON(page);
		let marks = json.children[0]?.children[0]?.marks ?? [];
		expect(marks.some((m) => m.type === 'font')).toBe(true);

		// Select all again and open fontSize popup, select size 24
		await page.keyboard.press('Control+a');
		const sizeBtn = toolbarButton(page, 'fontSize');
		await sizeBtn.click();
		const sizePopup = page.locator('ntl-editor notectl-editor .notectl-font-size-picker');
		await sizePopup
			.locator('.notectl-font-size-picker__item')
			.filter({ hasText: /^.*24$/ })
			.click();

		// Verify both marks present in JSON
		json = await getJSON(page);
		marks = json.children[0]?.children[0]?.marks ?? [];
		const markTypes = marks.map((m) => m.type);
		expect(markTypes).toContain('font');
		expect(markTypes).toContain('fontSize');
	});
});

test.describe('Angular — Rich Document Workflow', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('heading, table, and paragraph combination', async ({ page }) => {
		const content = contentLocator(page);
		await content.click();

		// Create heading
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Data Overview', { delay: 10 });
		await page.keyboard.press('Enter');

		// Type intro paragraph
		await page.keyboard.type('Below is a summary table:', { delay: 10 });
		await page.keyboard.press('Enter');

		// Insert table via toolbar — click button, then pick size from grid
		await toolbarButton(page, 'table').click();
		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="2"][data-col="3"]');
		await gridCell.click();

		// Verify the document has heading + paragraph + table
		const json = await getJSON(page);
		const types = json.children.map((c) => c.type);
		expect(types).toContain('heading');
		expect(types).toContain('paragraph');
		expect(types).toContain('table');

		const text = await getText(page);
		expect(text).toContain('Data Overview');
		expect(text).toContain('Below is a summary table:');
	});

	test('multiline editing with Enter creates new paragraphs', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('First paragraph', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second paragraph', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Third paragraph', { delay: 10 });

		const json = await getJSON(page);
		expect(json.children.length).toBe(3);
		expect(json.children[0]?.type).toBe('paragraph');
		expect(json.children[1]?.type).toBe('paragraph');
		expect(json.children[2]?.type).toBe('paragraph');

		const text = await getText(page);
		expect(text).toContain('First paragraph');
		expect(text).toContain('Second paragraph');
		expect(text).toContain('Third paragraph');
	});

	test('select all and delete replaces document', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Some text to delete', { delay: 10 });

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Backspace');

		const text = await getText(page);
		expect(text.trim()).toBe('');
	});

	test('keyboard navigation preserves cursor position', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Hello', { delay: 10 });

		// Wait for selection sync to settle after typing
		await page.waitForTimeout(100);

		// Move cursor to beginning using Home key
		await page.keyboard.press('Home');
		await page.waitForTimeout(50);

		await page.keyboard.type('Start ', { delay: 10 });

		const text = await getText(page);
		expect(text.trim()).toBe('Start Hello');
	});
});
