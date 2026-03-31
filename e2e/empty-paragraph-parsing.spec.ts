import { expect, test } from './fixtures/editor-page';

test.describe('Empty paragraph parsing via setContentHTML (#85)', () => {
	const INPUT_HTML =
		'<p>This is a paragraph.</p><p><br></p><p>This is another paragraph.</p><p><br></p>';

	test('setContentHTML preserves exactly 4 blocks for input with empty paragraphs', async ({
		editor,
	}) => {
		await editor.setContentHTML(INPUT_HTML);

		const json = await editor.getJSON();
		expect(json.children).toHaveLength(4);
		expect(json.children[0].type).toBe('paragraph');
		expect(json.children[1].type).toBe('paragraph');
		expect(json.children[2].type).toBe('paragraph');
		expect(json.children[3].type).toBe('paragraph');
	});

	test('empty paragraphs have no hard_break inline nodes', async ({ editor }) => {
		await editor.setContentHTML(INPUT_HTML);

		const json = await editor.getJSON();

		// Block 1 (index 1) should be an empty paragraph, not contain a hard_break
		const emptyBlock1 = json.children[1];
		const hasHardBreak1 = emptyBlock1.children?.some(
			(child: Record<string, unknown>) =>
				child.type === 'inline' && child.inlineType === 'hard_break',
		);
		expect(hasHardBreak1).toBeFalsy();

		// Block 3 (index 3) should also be empty
		const emptyBlock3 = json.children[3];
		const hasHardBreak3 = emptyBlock3.children?.some(
			(child: Record<string, unknown>) =>
				child.type === 'inline' && child.inlineType === 'hard_break',
		);
		expect(hasHardBreak3).toBeFalsy();
	});

	test('getContentHTML roundtrip preserves empty paragraphs as <p><br></p>', async ({ editor }) => {
		await editor.setContentHTML(INPUT_HTML);

		const output = await editor.getContentHTML();
		expect(output).toBe(INPUT_HTML);
	});

	test('empty paragraphs render with single <br>, not double', async ({ editor, page }) => {
		await editor.setContentHTML(INPUT_HTML);

		// Count <br> elements inside each empty paragraph block in the DOM
		const brCounts = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const content = el?.shadowRoot?.querySelector('.notectl-content');
			if (!content) return [];
			const blocks = content.querySelectorAll('[data-block-id]');
			return Array.from(blocks).map((block) => block.querySelectorAll('br').length);
		});

		// Block 0: text content, no <br> expected
		expect(brCounts[0]).toBe(0);
		// Block 1: empty paragraph, exactly 1 <br>
		expect(brCounts[1]).toBe(1);
		// Block 2: text content, no <br> expected
		expect(brCounts[2]).toBe(0);
		// Block 3: empty paragraph, exactly 1 <br>
		expect(brCounts[3]).toBe(1);
	});
});
