import { expect, test } from './fixtures/editor-page';

type JsonChild = {
	type: string;
	children?: JsonChild[];
	attrs?: Record<string, unknown>;
	text?: string;
};

test.describe('List Outdent (Shift+Tab)', () => {
	test('Shift+Tab outdents indented bullet list item', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item', { delay: 10 });

		// Indent with Tab
		await page.keyboard.press('Tab');
		let json: { children: JsonChild[] } = await editor.getJSON();
		let listItem = json.children[0];
		expect(listItem?.type).toBe('list_item');
		expect(listItem?.attrs?.indent).toBe(1);

		// Outdent with Shift+Tab
		await page.keyboard.press('Shift+Tab');
		json = await editor.getJSON();
		listItem = json.children[0];
		expect(listItem?.type).toBe('list_item');
		expect(listItem?.attrs?.indent).toBe(0);
	});

	test('Shift+Tab at indent=0 keeps block as list_item', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item', { delay: 10 });

		// Verify it's a list_item at indent 0
		let json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.indent).toBe(0);

		// Shift+Tab at indent=0 should not change type
		await page.keyboard.press('Shift+Tab');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
	});

	test('Tab/Shift+Tab cycles preserve text', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Preserved text', { delay: 10 });

		// Indent twice
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		let json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children[0]?.attrs?.indent).toBe(2);

		// Outdent twice
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('Shift+Tab');
		json = await editor.getJSON();
		expect(json.children[0]?.attrs?.indent).toBe(0);

		// Text should be intact
		const text = await editor.getText();
		expect(text).toContain('Preserved text');
	});

	test('indent/outdent works for ordered lists too', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('Numbered', { delay: 10 });

		let json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('ordered');

		// Indent
		await page.keyboard.press('Tab');
		json = await editor.getJSON();
		expect(json.children[0]?.attrs?.indent).toBe(1);

		// Outdent
		await page.keyboard.press('Shift+Tab');
		json = await editor.getJSON();
		expect(json.children[0]?.attrs?.indent).toBe(0);
		expect(json.children[0]?.attrs?.listType).toBe('ordered');
	});
});
