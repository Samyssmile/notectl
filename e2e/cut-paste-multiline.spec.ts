import { expect, test } from './fixtures/editor-page';

test.beforeEach(async ({ context }) => {
	try {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	} catch {
		// Best-effort: some browsers do not expose clipboard permissions via Playwright.
	}
});

type JsonChild = {
	type: string;
	children?: JsonChild[];
	text?: string;
	marks?: { type: string }[];
};

test.describe('Cut and paste multi-line content', () => {
	test('cut two paragraphs and paste preserves line breaks', async ({ editor, page }) => {
		// Arrange: create two paragraphs
		await editor.typeText('Zeile A');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Zeile B', { delay: 10 });

		// Verify initial state
		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		expect(beforeJson.children.length).toBeGreaterThanOrEqual(2);

		// Act: select all, cut, then paste
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		// Assert: should still have two paragraphs with correct text
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		expect(paragraphs.length).toBeGreaterThanOrEqual(2);

		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts).toContain('Zeile A');
		expect(texts).toContain('Zeile B');
	});

	test('cut three paragraphs and paste preserves all line breaks', async ({ editor, page }) => {
		// Arrange: create three paragraphs
		await editor.typeText('First');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Third', { delay: 10 });

		// Verify initial state
		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		expect(beforeJson.children.length).toBeGreaterThanOrEqual(3);

		// Act: select all, cut, paste
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		// Assert: should have three paragraphs
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		expect(paragraphs.length).toBeGreaterThanOrEqual(3);

		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts).toContain('First');
		expect(texts).toContain('Second');
		expect(texts).toContain('Third');
	});

	test('copy two paragraphs and paste preserves line breaks', async ({ editor, page }) => {
		// Arrange: create two paragraphs
		await editor.typeText('Line A');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line B', { delay: 10 });

		// Act: select all, copy (not cut), move to end, paste
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+c');
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		// Assert: should have original + pasted paragraphs
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts.filter((t) => t === 'Line A').length).toBeGreaterThanOrEqual(2);
		expect(texts.filter((t) => t === 'Line B').length).toBeGreaterThanOrEqual(2);
	});

	test('paste multi-line plain text creates multiple blocks', async ({ editor }) => {
		// Arrange: focus editor
		await editor.focus();

		// Act: paste plain text with newlines (simulates external paste)
		await editor.pasteText('Alpha\nBeta\nGamma');
		await editor.page.waitForTimeout(200);

		// Assert: should create separate paragraphs
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		expect(paragraphs.length).toBeGreaterThanOrEqual(3);

		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts).toContain('Alpha');
		expect(texts).toContain('Beta');
		expect(texts).toContain('Gamma');
	});

	test('paste HTML with multiple paragraphs creates multiple blocks', async ({ editor }) => {
		// Arrange: focus editor
		await editor.focus();

		// Act: paste HTML with <p> tags
		await editor.pasteHTML('<p>Para One</p><p>Para Two</p>');
		await editor.page.waitForTimeout(200);

		// Assert: should create two paragraphs
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		expect(paragraphs.length).toBeGreaterThanOrEqual(2);

		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts).toContain('Para One');
		expect(texts).toContain('Para Two');
	});
});
