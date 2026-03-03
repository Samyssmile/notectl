import { expect, test } from './fixtures/editor-page';
import {
	type JsonChild,
	buildShowcaseViaInteraction,
	normalizeDoc,
	performCutPasteRoundtrip,
} from './fixtures/showcase-data';

test.beforeEach(async ({ context }) => {
	try {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	} catch {
		// Best-effort: some browsers do not expose clipboard permissions via Playwright.
	}
});

test.describe('Showcase document cut/paste roundtrip', () => {
	test('build via toolbar → cut → paste preserves full document', async ({ editor, page }) => {
		test.setTimeout(120_000);

		await buildShowcaseViaInteraction(page, editor);
		const { beforeJson, afterJson } = await performCutPasteRoundtrip(page, editor);

		expect(beforeJson.children.length).toBeGreaterThan(10);
		expect(normalizeDoc(afterJson)).toEqual(normalizeDoc(beforeJson));
	});

	test('all block types survive the roundtrip', async ({ editor, page }) => {
		test.setTimeout(120_000);

		await buildShowcaseViaInteraction(page, editor);
		const { afterJson } = await performCutPasteRoundtrip(page, editor);
		const types: string[] = afterJson.children.map((c) => c.type);

		expect(types).toContain('heading');
		expect(types).toContain('paragraph');
		expect(types).toContain('code_block');
		expect(types).toContain('blockquote');
		expect(types).toContain('list_item');
		expect(types).toContain('table');
		expect(types).toContain('horizontal_rule');
		expect(types).toContain('image');
	});

	test('all inline mark types survive the roundtrip', async ({ editor, page }) => {
		test.setTimeout(120_000);

		await buildShowcaseViaInteraction(page, editor);
		const { afterJson } = await performCutPasteRoundtrip(page, editor);

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
