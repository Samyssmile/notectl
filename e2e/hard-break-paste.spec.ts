import { expect, test } from './fixtures/editor-page';

test.describe('Pasted line breaks survive save and reload (#268)', () => {
	for (const example of [
		{ name: 'wrapped heading', html: '<div><h2>a<br>b</h2><p>c</p></div>', selector: 'h2' },
		{ name: 'list item', html: '<ul><li>Open<br>the editor</li></ul>', selector: 'li' },
		{ name: 'top-level inline run', html: 'a<strong><br>b</strong>', selector: 'p' },
	]) {
		test(example.name, async ({ editor }) => {
			await editor.focus();
			await editor.pasteClipboardData({ 'text/html': example.html });
			await expect(editor.content.locator(example.selector).first().locator('br')).toHaveCount(1);
			const saved: string = await editor.getContentHTML();
			expect(saved).toContain('<br>');

			await editor.setContentHTML(saved);

			expect(await editor.getContentHTML()).toBe(saved);
			await expect(editor.content.locator(example.selector).first().locator('br')).toHaveCount(1);
		});
	}

	test('a lone heading break remains one empty line before and after reload', async ({
		editor,
	}) => {
		await editor.focus();
		await editor.pasteClipboardData({ 'text/html': '<h2><br></h2>' });
		await expect(editor.content.locator('h2 br')).toHaveCount(1);
		await editor.setContentHTML(await editor.getContentHTML());
		await expect(editor.content.locator('h2 br')).toHaveCount(1);
	});

	test('consecutive and trailing breaks retain formatting and undo as one paste', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.pasteClipboardData({
			'text/html': '<h3><strong>a<br><br>b<br></strong></h3>',
		});
		const saved: string = await editor.getContentHTML();
		expect(saved.match(/<br>/g)).toHaveLength(3);

		await page.keyboard.press('Control+z');
		await expect(editor.content.locator('h3')).toHaveCount(0);
		await page.keyboard.press('Control+Shift+z');
		expect(await editor.getContentHTML()).toBe(saved);

		await editor.setContentHTML(saved);
		expect(await editor.getContentHTML()).toBe(saved);
		await expect(editor.content.locator('h3 strong')).toContainText(['a', 'b']);
	});

	test('pre imports as code with its language, indentation and empty lines', async ({ editor }) => {
		const code: string = '\n  const a = 1;\n\n\tconsole.log(a);\n';
		await editor.focus();
		await editor.pasteClipboardData({
			'text/html': `<div><pre><code class="language-js">${code}</code></pre></div>`,
		});
		await expect(editor.content.locator('pre code')).toHaveText(code, { useInnerText: false });
		const saved: string = await editor.getContentHTML();
		expect(saved).toContain(`<code class="language-js">${code}</code>`);

		await editor.setContentHTML(saved);

		expect(await editor.getContentHTML()).toBe(saved);
		expect(editor.getBlockText(await editor.getJSON(), 0)).toBe(code);
	});

	test('bare pre preserves leading blank lines through clipboard parsing', async ({ editor }) => {
		await editor.focus();
		await editor.pasteClipboardData({ 'text/html': '<pre>\n\na\nb</pre>' });
		// HTML itself discards the first newline immediately after <pre>.
		expect(await editor.content.locator('pre code').textContent()).toBe('\na\nb');
		const saved: string = await editor.getContentHTML();
		await editor.setContentHTML(saved);
		expect(await editor.content.locator('pre code').textContent()).toBe('\na\nb');
	});

	test('nested bare pre preserves leading blank lines through import and container paste', async ({
		editor,
	}) => {
		const html: string = '<blockquote><pre>\n\na<br>b</pre></blockquote>';
		await editor.focus();
		await editor.pasteClipboardData({ 'text/html': html });
		expect(await editor.content.locator('blockquote pre code').textContent()).toBe('\na\nb');

		await editor.setContentHTML(html);
		expect(await editor.content.locator('blockquote pre code').textContent()).toBe('\na\nb');
	});

	test('pre falls back to paragraphs without a code plugin, including empty lines', async ({
		editor,
	}) => {
		await editor.recreateWithPlugins({ toolbar: [] });
		await editor.focus();
		await editor.pasteClipboardData({ 'text/html': '<div><pre>a\n\nb<br>c\n</pre></div>' });
		await expect(editor.content.locator('p')).toHaveCount(5);
		const saved: string = await editor.getContentHTML();

		await editor.setContentHTML(saved);

		expect(await editor.getContentHTML()).toBe(saved);
		await expect(editor.content.locator('p')).toHaveText(['a', '', 'b', 'c', '']);
	});
});
