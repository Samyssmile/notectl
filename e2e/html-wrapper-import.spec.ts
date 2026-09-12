import { expect, test } from './fixtures/editor-page';

test.describe('HTML wrapper import (#223)', () => {
	test('setContentHTML preserves nested wrappers and their links', async ({ editor }) => {
		await editor.setContentHTML('<div><a href="/guide"><p>a</p><p>b</p></a></div>');
		const doc = await editor.getJSON();
		expect(doc.children.map((block) => block.type)).toEqual(['paragraph', 'paragraph']);
		expect(doc.children.map((block) => block.children.map((child) => child.text).join(''))).toEqual(
			['a', 'b'],
		);
		for (const block of doc.children) {
			expect(block.children[0]?.marks).toContainEqual({ type: 'link', attrs: { href: '/guide' } });
		}
	});

	test('pasting a div keeps an inline formula editable between its surrounding text', async ({
		editor,
	}) => {
		await editor.focus();
		const html =
			'<div>before <math display="inline"><semantics><msup><mi>a</mi><mn>2</mn></msup>' +
			'<annotation encoding="application/x-tex">a^2</annotation></semantics></math> after</div>';
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': 'before a^2 after' });
		const doc = await editor.getJSON();
		expect(doc.children).toHaveLength(1);
		expect(doc.children[0]?.children).toEqual([
			expect.objectContaining({ type: 'text', text: 'before ' }),
			expect.objectContaining({
				type: 'inline',
				inlineType: 'math_inline',
				attrs: expect.objectContaining({ latex: 'a^2' }),
			}),
			expect.objectContaining({ type: 'text', text: ' after' }),
		]);
		await expect(editor.content.locator('.notectl-math--inline')).toHaveCount(1);
	});
});
