import { expect, test } from './fixtures/editor-page';
import {
	type DocDef,
	type JsonChild,
	buildShowcaseDocument,
	loadAndRoundtrip,
	normalize,
} from './fixtures/showcase-data';

test.beforeEach(async ({ context }) => {
	try {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	} catch {
		// Best-effort: some browsers do not expose clipboard permissions via Playwright.
	}
});

test.describe('Showcase document cut/paste roundtrip', () => {
	test('select-all → cut → paste preserves the full document', async ({ editor, page }) => {
		const showcase: DocDef = buildShowcaseDocument();

		await editor.setJSON(showcase);
		await page.waitForTimeout(500);

		// Capture the "before" snapshot
		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		expect(beforeJson.children.length).toBeGreaterThan(10);

		// Select All → Cut
		await editor.focus();
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(200);

		// Verify the editor is empty (single empty paragraph)
		const emptyJson: { children: JsonChild[] } = await editor.getJSON();
		expect(emptyJson.children.length).toBeLessThanOrEqual(1);

		// Paste
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		// Capture the "after" snapshot and deep-compare with normalization
		const afterJson: { children: JsonChild[] } = await editor.getJSON();
		expect(normalize(afterJson)).toEqual(normalize(beforeJson));
	});

	test('all block types survive the roundtrip', async ({ editor, page }) => {
		const { afterJson } = await loadAndRoundtrip(editor, page);
		const types: string[] = afterJson.children.map((c) => c.type);

		expect(types).toContain('heading');
		expect(types).toContain('paragraph');
		expect(types).toContain('code_block');
		expect(types).toContain('blockquote');
		expect(types).toContain('list_item');
		expect(types).toContain('table');
		expect(types).toContain('horizontal_rule');
	});

	test('all inline mark types survive the roundtrip', async ({ editor, page }) => {
		const { afterJson } = await loadAndRoundtrip(editor, page);

		// Find the paragraph that has multiple mark types (the showcase marks paragraph)
		const markParagraph: JsonChild | undefined = afterJson.children.find(
			(c) =>
				c.type === 'paragraph' &&
				(c.children ?? []).some(
					(t) => (t.marks ?? []).length > 0 && t.marks?.some((m) => m.type === 'bold'),
				),
		);
		expect(markParagraph).toBeDefined();

		const allMarks: string[] = (markParagraph?.children ?? []).flatMap((t) =>
			(t.marks ?? []).map((m) => m.type),
		);

		expect(allMarks).toContain('bold');
		expect(allMarks).toContain('italic');
		expect(allMarks).toContain('underline');
		expect(allMarks).toContain('strikethrough');
		expect(allMarks).toContain('superscript');
		expect(allMarks).toContain('subscript');
		expect(allMarks).toContain('link');
		expect(allMarks).toContain('textColor');
		expect(allMarks).toContain('highlight');
		expect(allMarks).toContain('font');
		expect(allMarks).toContain('fontSize');
	});
});
