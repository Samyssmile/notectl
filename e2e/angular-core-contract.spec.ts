import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Angular <-> Core Contract Tests
 *
 * Verifies behavior through the Angular wrapper that is NOT already covered
 * by `angular-toolbar.spec.ts`, `angular-state-inspector.spec.ts`,
 * `api.spec.ts`, `marks.spec.ts`, or `history.spec.ts`.
 *
 * Focus:
 *   1. Mark Composition — attribute-carrying marks, block+mark+alignment composition
 *   2. History Integrity — structural undo/redo (block type, block merge)
 *   3. JSON Roundtrip — complex multi-type documents survive serialization
 */

// --- Helpers ---

interface MarkJSON {
	readonly type: string;
	readonly attrs?: Record<string, unknown>;
}

interface ChildJSON {
	readonly text: string;
	readonly marks?: MarkJSON[];
}

interface BlockJSON {
	readonly type: string;
	readonly attrs?: Record<string, unknown>;
	readonly children: ChildJSON[];
}

interface EditorJSON {
	readonly children: BlockJSON[];
}

function getJSON(page: Page): Promise<EditorJSON> {
	return page.evaluate(() => {
		const el = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
		return (el as unknown as { getJSON(): EditorJSON }).getJSON();
	});
}

function getText(page: Page): Promise<string> {
	return page.evaluate(() => {
		const el = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
		return (el as unknown as { getText(): string }).getText();
	});
}

function firstBlock(json: EditorJSON): BlockJSON {
	const block = json.children[0];
	if (!block) throw new Error('No blocks in document');
	return block;
}

function getMarkTypes(block: BlockJSON): string[] {
	return (block.children[0]?.marks ?? []).map((m) => m.type);
}

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

function content(page: Page) {
	return page.locator('ntl-editor notectl-editor div.notectl-content');
}

function toolbar(page: Page, itemId: string) {
	return page.locator(`ntl-editor notectl-editor button[data-toolbar-item="${itemId}"]`);
}

// ─────────────────────────────────────────────────────────────────────
// 1. Mark Composition
// ─────────────────────────────────────────────────────────────────────

test.describe('Angular — Mark Composition', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('link mark carries href attribute in JSON', async ({ page }) => {
		await content(page).click();
		await page.keyboard.type('Click here', { delay: 10 });
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await toolbar(page, 'link').click();

		const urlInput = page.locator('ntl-editor notectl-editor input[aria-label="URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill('https://example.com');

		const applyBtn = page.locator('ntl-editor notectl-editor button[aria-label="Apply link"]');
		await applyBtn.click();

		const marks = (await getJSON(page)).children[0]?.children[0]?.marks ?? [];
		const link = marks.find((m) => m.type === 'link');
		expect(link).toBeDefined();
		expect(link?.attrs?.href).toBe('https://example.com');
	});

	test('heading + bold + center alignment compose correctly in JSON', async ({ page }) => {
		await content(page).click();
		await page.keyboard.type('Styled Heading', { delay: 10 });

		await page.keyboard.press('Control+Shift+2');
		await page.keyboard.press('Control+Shift+e');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		const block = firstBlock(await getJSON(page));
		expect(block.type).toBe('heading');
		expect(block.attrs?.level).toBe(2);
		expect(block.attrs?.align).toBe('center');
		expect(getMarkTypes(block)).toContain('bold');
	});
});

// ─────────────────────────────────────────────────────────────────────
// 2. History Integrity — structural undo/redo through Angular
// ─────────────────────────────────────────────────────────────────────

test.describe('Angular — History Integrity', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('undo block type change restores paragraph', async ({ page }) => {
		await content(page).click();
		await page.keyboard.type('Heading text', { delay: 10 });

		await page.keyboard.press('Control+Shift+1');
		expect((await getJSON(page)).children[0]?.type).toBe('heading');

		await page.keyboard.press('Control+z');
		const block = firstBlock(await getJSON(page));
		expect(block.type).toBe('paragraph');
		expect(block.children[0]?.text).toBe('Heading text');
	});

	test('undo block merge restores two separate blocks', async ({ page }) => {
		await content(page).click();
		await page.keyboard.type('Block A', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Block B', { delay: 10 });

		await page.keyboard.press('Home');
		await page.keyboard.press('Backspace');
		expect((await getJSON(page)).children).toHaveLength(1);

		await page.keyboard.press('Control+z');
		expect((await getJSON(page)).children).toHaveLength(2);

		const text = await getText(page);
		expect(text).toContain('Block A');
		expect(text).toContain('Block B');
	});

	test('undo formatting step-by-step removes marks in reverse order', async ({ page }) => {
		await content(page).click();
		await page.keyboard.type('Format me', { delay: 10 });
		await page.keyboard.press('Control+a');

		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+i');
		await page.keyboard.press('Control+u');

		const marks = () => getJSON(page).then((j) => getMarkTypes(firstBlock(j)));

		expect(await marks()).toEqual(expect.arrayContaining(['bold', 'italic', 'underline']));

		await page.keyboard.press('Control+z');
		expect(await marks()).not.toContain('underline');
		expect(await marks()).toContain('bold');

		await page.keyboard.press('Control+z');
		expect(await marks()).not.toContain('italic');
		expect(await marks()).toContain('bold');

		await page.keyboard.press('Control+z');
		expect(await marks()).not.toContain('bold');

		expect((await getText(page)).trim()).toBe('Format me');
	});
});

// ─────────────────────────────────────────────────────────────────────
// 3. JSON Roundtrip — complex documents survive serialization
// ─────────────────────────────────────────────────────────────────────

test.describe('Angular — JSON Roundtrip', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('multi-block document with diverse types roundtrips via getJSON/setJSON', async ({
		page,
	}) => {
		await content(page).click();

		// Build diverse document: heading, bold paragraph, code block
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Title', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+b');
		await page.keyboard.type('Bold text', { delay: 10 });
		await page.keyboard.press('Control+b');
		await page.keyboard.press('Enter');
		await page.keyboard.type('```typescript ', { delay: 10 });
		await page.keyboard.type('const x = 42;', { delay: 10 });

		const result = await page.evaluate(() => {
			const el = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
			type Child = { text: string; marks?: { type: string }[] };
			type Block = { type: string; attrs?: Record<string, unknown>; children: Child[] };
			const api = el as unknown as {
				getJSON(): { children: Block[] };
				setJSON(d: unknown): void;
				getText(): string;
			};

			const original = api.getJSON();
			const originalTypes = original.children.map((c) => c.type);
			const originalText = api.getText();
			const originalMarks = original.children.flatMap((b) =>
				b.children.flatMap((c) => c.marks?.map((m) => m.type) ?? []),
			);

			// Roundtrip: setJSON with the captured document
			api.setJSON(original);

			const restored = api.getJSON();
			const restoredTypes = restored.children.map((c) => c.type);
			const restoredText = api.getText();
			const restoredMarks = restored.children.flatMap((b) =>
				b.children.flatMap((c) => c.marks?.map((m) => m.type) ?? []),
			);

			return {
				originalTypes,
				restoredTypes,
				originalText,
				restoredText,
				originalMarks,
				restoredMarks,
			};
		});

		// Block types preserved
		expect(result.restoredTypes).toEqual(result.originalTypes);
		expect(result.restoredTypes).toContain('heading');
		expect(result.restoredTypes).toContain('code_block');

		// Text preserved
		expect(result.restoredText).toBe(result.originalText);

		// Marks preserved
		expect(result.restoredMarks).toEqual(result.originalMarks);
		expect(result.restoredMarks).toContain('bold');
	});

	test('code block language attribute survives roundtrip', async ({ page }) => {
		await content(page).click();
		await page.keyboard.type('```typescript ', { delay: 10 });
		await page.keyboard.type('const x: number = 42;', { delay: 10 });

		const result = await page.evaluate(() => {
			const el = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
			type Block = { type: string; attrs?: Record<string, unknown>; children: { text: string }[] };
			const api = el as unknown as { getJSON(): { children: Block[] }; setJSON(d: unknown): void };

			const original = api.getJSON();
			api.setJSON(original);
			const code = api.getJSON().children.find((c) => c.type === 'code_block');
			return { type: code?.type, language: code?.attrs?.language, text: code?.children[0]?.text };
		});

		expect(result.type).toBe('code_block');
		expect(result.language).toBe('typescript');
		expect(result.text).toContain('const x: number = 42;');
	});
});
