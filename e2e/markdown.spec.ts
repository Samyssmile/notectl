import { expect, test } from './fixtures/editor-page';

/** Calls the editor's async `getContentMarkdown()` in the page. */
async function getMarkdown(page: import('@playwright/test').Page): Promise<string> {
	return page.evaluate(async () => {
		const el = document.querySelector('notectl-editor') as HTMLElement & {
			getContentMarkdown(): Promise<string>;
		};
		return el.getContentMarkdown();
	});
}

/** Calls the editor's async `setContentMarkdown()` in the page. */
async function setMarkdown(page: import('@playwright/test').Page, md: string): Promise<void> {
	await page.evaluate(async (markdown) => {
		const el = document.querySelector('notectl-editor') as HTMLElement & {
			setContentMarkdown(markdown: string): Promise<void>;
		};
		await el.setContentMarkdown(markdown);
	}, md);
}

test.describe('Markdown — live typing', () => {
	test('**bold** transforms to bold and consumes the syntax', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('**bold**', { delay: 10 });

		const html = await editor.getContentHTML();
		expect(html).toContain('<strong>bold</strong>');
		expect(html).not.toContain('**');
	});

	test('*italic* transforms to italic', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('say *hi*', { delay: 10 });

		const html = await editor.getContentHTML();
		expect(html).toContain('<em>hi</em>');
	});

	test('~~strike~~ transforms to strikethrough', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('~~gone~~', { delay: 10 });

		const html = await editor.getContentHTML();
		expect(html).toContain('<s>gone</s>');
	});

	test('[text](url) transforms to a link', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('[site](https://example.com)', { delay: 10 });

		const html = await editor.getContentHTML();
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('>site</a>');
	});

	test('# heading transforms the block to a heading', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('# Title', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
	});
});

test.describe('Markdown — export', () => {
	test('getContentMarkdown returns Markdown for typed content', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('# Heading', { delay: 10 });
		await page.keyboard.press('Enter');
		// Note: bold is inclusive, so it would bleed onto trailing text typed after
		// `**bold**`. Type the wrapped run as the whole paragraph to assert export.
		await page.keyboard.type('**bold**', { delay: 10 });

		const md = await getMarkdown(page);
		expect(md).toContain('# Heading');
		expect(md).toContain('**bold**');
	});
});

test.describe('Markdown — import', () => {
	test('setContentMarkdown parses headings, lists, tables, and code', async ({ editor, page }) => {
		await setMarkdown(
			page,
			'# Doc\n\n- one\n- two\n\n| H1 | H2 |\n| --- | --- |\n| a | b |\n\n```js\ncode()\n```',
		);

		const json = await editor.getJSON();
		const types = json.children.map((b: { type: string }) => b.type);
		expect(types).toContain('heading');
		expect(types).toContain('list_item');
		expect(types).toContain('table');
		expect(types).toContain('code_block');
	});

	test('setContentMarkdown announces the import to screen readers (#192 Bug #8)', async ({
		editor,
		page,
	}) => {
		await setMarkdown(page, '# Doc\n\n- one\n- two');

		// The import writes a polite live-region message so screen-reader users learn
		// the document was replaced from Markdown (issue #192 a11y acceptance criterion).
		await expect(editor.announcer()).toHaveText('Markdown imported');
	});

	test('pasting a Markdown document auto-converts it (D11 paste branch)', async ({ editor }) => {
		// Per D11 the Markdown branch defers to plugin paste interceptors. The full
		// preset's smart-paste (and code-block) claim structured/fenced text first,
		// so isolate the Markdown branch with an editor that omits them.
		await editor.recreateWithPlugins({
			toolbar: [
				[
					{ name: 'HeadingPlugin' },
					{ name: 'ListPlugin' },
					{ name: 'TablePlugin' },
					{ name: 'TextFormattingPlugin' },
					{ name: 'LinkPlugin' },
				],
			],
			autofocus: true,
		});
		await editor.focus();
		await editor.pasteText('# Heading\n\n- one\n- two\n\n| H1 | H2 |\n| --- | --- |\n| a | b |');

		// The Markdown paste branch is async (dynamic import + parse + dispatch).
		await expect
			.poll(async () => (await editor.getJSON()).children.map((b: { type: string }) => b.type))
			.toContain('table');

		const types = (await editor.getJSON()).children.map((b: { type: string }) => b.type);
		expect(types).toContain('heading');
		expect(types).toContain('list_item');

		// The Markdown paste branch announces the import for screen readers (#192 Bug #8).
		await expect(editor.announcer()).toHaveText('Markdown imported');
	});

	test('pasting ordinary prose with a stray asterisk is NOT markdownified', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText('Just some prose with a * stray asterisk and an _ underscore.');

		const json = await editor.getJSON();
		expect(json.children).toHaveLength(1);
		const text = await editor.getText();
		expect(text).toContain('* stray asterisk');
		expect(text).toContain('_ underscore');
	});

	test('round-trip getContentMarkdown(setContentMarkdown(md)) is stable', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		const md = '# Title\n\nA paragraph with **bold** and *italic*.\n\n- a\n- b';
		await setMarkdown(page, md);
		const out = (await getMarkdown(page)).trim();
		expect(out).toContain('# Title');
		expect(out).toContain('**bold**');
		expect(out).toContain('*italic*');
		expect(out).toContain('- a');
		expect(out).toContain('- b');
	});
});
