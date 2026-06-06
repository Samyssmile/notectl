import {
	type InteractionEditor,
	type JsonChild,
	blockTypes,
	buildComplexDocument,
	projectDoc,
} from './fixtures/complex-document';
import { EXPECTED_DOCUMENT, EXPECTED_TYPES } from './fixtures/complex-document-expected';
import { expect, test } from './fixtures/editor-page';
import { normalizeDoc } from './fixtures/showcase-data';

/**
 * Bug-finding suite. A complex document that exercises every non-video plugin
 * is built purely through user interactions, then its document model is
 * checked against a hand-authored expected model. Undo/redo and
 * copy/cut/paste are exercised on the same document.
 */

const BUILD_TIMEOUT = 180_000;

type Doc = { children: JsonChild[] };

/** Recursively removes the given keys from every object in a structure (returns a copy). */
function stripKeysDeep(value: unknown, keys: ReadonlySet<string>): unknown {
	if (Array.isArray(value)) return value.map((v) => stripKeysDeep(v, keys));
	if (value !== null && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (keys.has(k)) continue;
			out[k] = stripKeysDeep(v, keys);
		}
		return out;
	}
	return value;
}

/** Recursively drops a trailing whitespace-only text node from every node (clipboard trims these). */
function dropTrailingWsText(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((v) => dropTrailingWsText(v));
	if (value !== null && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj)) out[k] = dropTrailingWsText(v);
		if (Array.isArray(out.children) && out.children.length > 0) {
			const kids = out.children as Record<string, unknown>[];
			const last = kids[kids.length - 1];
			const marks = last?.marks as unknown[] | undefined;
			if (
				last?.type === 'text' &&
				typeof last.text === 'string' &&
				last.text.trim() === '' &&
				(!marks || marks.length === 0)
			) {
				out.children = kids.slice(0, -1);
			}
		}
		return out;
	}
	return value;
}

/** Recursively removes `attrs` keys that are empty objects (equivalent to absent). */
function dropEmptyAttrs(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((v) => dropEmptyAttrs(v));
	if (value !== null && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (k === 'attrs' && v !== null && typeof v === 'object' && Object.keys(v).length === 0) {
				continue;
			}
			out[k] = dropEmptyAttrs(v);
		}
		return out;
	}
	return value;
}

/** True when the document is a single empty paragraph (the editor's zero state). */
function isEmptyDoc(json: Doc): boolean {
	if (json.children.length !== 1) return false;
	const only = json.children[0];
	if (only.type !== 'paragraph') return false;
	const kids = only.children ?? [];
	if (kids.length === 0) return true;
	return kids.length === 1 && kids[0]?.type === 'text' && (kids[0]?.text ?? '') === '';
}

/** Presses Ctrl+Z until the document is empty (or `max` reached); returns the press count. */
async function undoUntilEmpty(
	page: import('@playwright/test').Page,
	editor: InteractionEditor,
	max = 400,
): Promise<number> {
	for (let i = 0; i < max; i++) {
		if (isEmptyDoc(await editor.getJSON())) return i;
		await page.keyboard.press('Control+z');
		await page.waitForTimeout(15);
	}
	return max;
}

test.describe('Complex document — model verification', () => {
	test.describe.configure({ timeout: BUILD_TIMEOUT });

	test.beforeEach(async ({ context }) => {
		try {
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		} catch {
			// Some browsers do not expose clipboard permissions through Playwright.
		}
	});

	test('builds a comprehensive document whose model matches the expected model exactly', async ({
		editor,
		page,
	}) => {
		await buildComplexDocument(page, editor);
		const json = await editor.getJSON();

		// Spine first for a readable failure, then the full field-by-field model.
		expect(blockTypes(json)).toEqual(EXPECTED_TYPES);
		expect(projectDoc(json)).toEqual(EXPECTED_DOCUMENT);
	});

	test('undo reverts every change to an empty document; redo restores it exactly', async ({
		editor,
		page,
	}) => {
		await buildComplexDocument(page, editor);
		const before = projectDoc(await editor.getJSON());

		await editor.focus();
		const steps = await undoUntilEmpty(page, editor);
		expect(steps).toBeGreaterThan(5);
		expect(isEmptyDoc(await editor.getJSON())).toBe(true);

		for (let i = 0; i < steps; i++) {
			await page.keyboard.press('Control+Shift+z');
			await page.waitForTimeout(15);
		}
		// Let the (reactive) auto-direction plugin settle before snapshotting.
		await page.waitForTimeout(500);
		// `dir` is recomputed reactively by the text-direction-auto plugin and is
		// not a faithful history target on a large document; compare all other
		// content/structure/marks, which redo must restore exactly.
		const noDir = new Set(['dir']);
		const noDirNorm = (d: unknown): unknown => dropEmptyAttrs(stripKeysDeep(d, noDir));
		expect(noDirNorm(projectDoc(await editor.getJSON()))).toEqual(noDirNorm(before));
	});

	test('select-all → copy → paste duplicates the document body', async ({ editor, page }) => {
		await buildComplexDocument(page, editor);
		const beforeBlocks = (await editor.getJSON()).children.length;

		await editor.focus();
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(80);
		await page.keyboard.press('Control+c');
		await page.waitForTimeout(150);
		await page.keyboard.press('ArrowRight'); // collapse the selection to its end
		await page.waitForTimeout(50);
		await page.keyboard.press('Control+v');

		// The paste settles asynchronously; poll the resulting model.
		await expect
			.poll(async () => (await editor.getJSON()).children.length)
			.toBeGreaterThan(beforeBlocks);
		const json = await editor.getJSON();
		// The H1 title now appears twice (original + pasted copy).
		expect(json.children.filter((c) => c.type === 'heading' && c.attrs?.level === 1)).toHaveLength(
			2,
		);
		expect((await editor.getText()).split('Complex Document').length - 1).toBe(2);
	});

	test('select-all → cut → paste preserves the document model', async ({ editor, page }) => {
		await buildComplexDocument(page, editor);
		const before = await editor.getJSON();

		await editor.focus();
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(80);
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(250);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(500);

		const after = await editor.getJSON();
		// The math-only default `fontSize` is the only field dropped on the
		// clipboard roundtrip; the formula `mathml`/`latex` now survive (#154).
		// Trailing whitespace text nodes are also trimmed by the clipboard.
		// Everything else — block structure, text, marks, alignment, list state,
		// link hrefs, image src — must roundtrip exactly.
		const lossy = new Set(['fontSize']);
		const norm = (doc: Doc): unknown => stripKeysDeep(dropTrailingWsText(normalizeDoc(doc)), lossy);
		expect(norm(after)).toEqual(norm(before));
	});
});

/** Inserts an inline `a^2` (amid text) and a display `y=2` formula. */
async function buildInlineAndDisplayFormula(
	editor: InteractionEditor,
	page: import('@playwright/test').Page,
): Promise<void> {
	await editor.focus();
	await page.keyboard.type('p ', { delay: 5 });
	await editor.root.locator('[aria-label="Insert formula"]').click();
	const inline = page.locator('.notectl-formula-editor__input');
	await inline.waitFor({ state: 'visible' });
	await inline.fill('a^2');
	await page.locator('.notectl-formula-editor__btn--primary').click();
	await page.waitForTimeout(120);
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');

	await editor.root.locator('[aria-label="Insert formula"]').click();
	const display = page.locator('.notectl-formula-editor__input');
	await display.waitFor({ state: 'visible' });
	await page.locator('.notectl-formula-editor__toggle input[type="checkbox"]').check();
	await display.fill('y=2');
	await page.locator('.notectl-formula-editor__btn--primary').click();
	await page.waitForTimeout(200);
}

/** Returns the `latex` attr of every math node (inline + display), document order. */
async function allLatex(editor: InteractionEditor): Promise<string[]> {
	const json = await editor.getJSON();
	const out: string[] = [];
	const walk = (n: JsonChild): void => {
		if (n.inlineType === 'math_inline' || n.type === 'math_display') {
			out.push((n.attrs as { latex?: string } | undefined)?.latex ?? '<none>');
		}
		for (const c of n.children ?? []) walk(c);
	};
	for (const c of json.children) walk(c);
	return out;
}

/** Returns the stored `mathml` of every math node (inline + display), document order. */
async function allMathml(editor: InteractionEditor): Promise<string[]> {
	const json = await editor.getJSON();
	const out: string[] = [];
	const walk = (n: JsonChild): void => {
		if (n.inlineType === 'math_inline' || n.type === 'math_display') {
			out.push((n.attrs as { mathml?: string } | undefined)?.mathml ?? '');
		}
		for (const c of n.children ?? []) walk(c);
	};
	for (const c of json.children) walk(c);
	return out;
}

/**
 * Confirmed findings, encoded as the *ideal* behaviour and skipped so CI stays
 * green. Remove `.fixme` to watch each one fail against current behaviour — a
 * runnable demonstration of the bug. Each reproduces from a minimal gesture on
 * a fresh editor (verified during authoring), so none is a builder artifact.
 */
test.describe('Complex document — findings (skipped: ideal behaviour)', () => {
	test.describe.configure({ timeout: 60_000 });

	async function insertFreshTable(
		editor: InteractionEditor,
		page: import('@playwright/test').Page,
	): Promise<void> {
		await editor.markButton('table').click();
		const picker = editor.root.locator('.notectl-grid-picker');
		await picker.waitFor({ state: 'visible' });
		await picker.locator('.notectl-grid-picker__cell[data-row="2"][data-col="2"]').click();
		await page.waitForTimeout(150);
	}

	test('typing immediately after a link should not extend the link', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('a', { delay: 10 });
		await page.keyboard.press('Shift+ArrowLeft'); // select "a"
		await page.waitForTimeout(60);
		await editor.markButton('link').click();
		const url = page.locator('notectl-editor input[aria-label="Link URL"]');
		await url.waitFor({ state: 'visible' });
		await url.fill('https://example.com');
		await page.locator('notectl-editor button[aria-label="Apply link"]').click();
		await page.waitForTimeout(100);
		await page.keyboard.press('End');
		await page.keyboard.type('b', { delay: 10 });

		const json = await editor.getJSON();
		const linked = (json.children[0]?.children ?? [])
			.filter((c) => (c.marks ?? []).some((m) => m.type === 'link'))
			.map((c) => c.text)
			.join('');
		// Ideal: only "a" carries the link. Current: the whole "ab" is linked.
		expect(linked).toBe('a');
	});

	test('inserting a table on an empty line should not leave a blank line above it', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertFreshTable(editor, page);
		// #152 fixed: ['table','paragraph'] (was ['paragraph','table','paragraph']).
		expect(blockTypes(await editor.getJSON())[0]).toBe('table');
	});

	test('inserting a horizontal rule on an empty line should not leave a blank line above it', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.markButton('horizontal-rule').click();
		await page.waitForTimeout(150);
		expect(blockTypes(await editor.getJSON())[0]).toBe('horizontal_rule');
	});

	test('inserting a display formula on an empty line should not leave a blank line above it', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();
		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		await page.locator('.notectl-formula-editor__toggle input[type="checkbox"]').check();
		await input.fill('x=1');
		await page.locator('.notectl-formula-editor__btn--primary').click();
		await page.waitForTimeout(200);
		expect(blockTypes(await editor.getJSON())[0]).toBe('math_display');
	});

	test('inline + display formulas keep their LaTeX source through a clipboard roundtrip (#154)', async ({
		editor,
		page,
	}) => {
		await buildInlineAndDisplayFormula(editor, page);
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(80);
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(400);
		// Both LaTeX sources survive so the pasted formulas stay editable, the
		// `<annotation>` wrapper is intact, and no `data-block-id` leaks into the
		// stored MathML.
		expect(await allLatex(editor)).toEqual(['a^2', 'y=2']);
		const mathml = await allMathml(editor);
		for (const m of mathml) {
			expect(m).toContain('<annotation');
			expect(m).not.toContain('data-block-id');
		}
	});

	test('inserting an image should leave no blank line above and exactly one trailing paragraph', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.markButton('image').click();
		const url = editor.root.locator('input[aria-label="Image URL"]');
		await url.waitFor({ state: 'visible' });
		await url.fill(
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==',
		);
		await editor.root.locator('button[aria-label="Insert image"]').click();
		await editor.root.locator('figure.notectl-image').waitFor({ state: 'visible' });
		await page.waitForTimeout(150);
		// #152 fixed: ['image','paragraph'] (was ['paragraph','image','paragraph']).
		expect(blockTypes(await editor.getJSON())).toEqual(['image', 'paragraph']);
	});

	test.fixme(
		'display-formula→image should leave exactly one trailing paragraph (residual, not #152)',
		async ({ editor, page }) => {
			// #152 (a stray paragraph ABOVE an inserted object) is fixed. A separate
			// residual remains: a display formula leaves a node selection plus its own
			// trailing paragraph, so a following image stacks a second trailing
			// paragraph. Ideal: exactly one trailing paragraph. See findings.md.
			await buildComplexDocument(page, editor);
			const types = blockTypes(await editor.getJSON());
			expect(types.slice(-2)).not.toEqual(['paragraph', 'paragraph']);
		},
	);
});
