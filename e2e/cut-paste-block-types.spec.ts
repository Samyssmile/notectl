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
	attrs?: Record<string, unknown>;
	text?: string;
	marks?: { type: string }[];
};

test.describe('Cut and paste preserves block types', () => {
	test('cut & paste bullet list items preserves list type', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item A', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Item B', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const listsBefore: JsonChild[] = beforeJson.children.filter((c) => c.type === 'list_item');
		expect(listsBefore.length).toBeGreaterThanOrEqual(2);

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const listItems: JsonChild[] = json.children.filter((c) => c.type === 'list_item');
		expect(listItems.length).toBeGreaterThanOrEqual(2);
		expect(listItems[0]?.attrs?.listType).toBe('bullet');
		expect(listItems[1]?.attrs?.listType).toBe('bullet');
	});

	test('cut & paste ordered list items preserves list type', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('First', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const listsBefore: JsonChild[] = beforeJson.children.filter(
			(c) => c.type === 'list_item' && c.attrs?.listType === 'ordered',
		);
		expect(listsBefore.length).toBeGreaterThanOrEqual(2);

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const listItems: JsonChild[] = json.children.filter(
			(c) => c.type === 'list_item' && c.attrs?.listType === 'ordered',
		);
		expect(listItems.length).toBeGreaterThanOrEqual(2);
	});

	test('cut & paste heading preserves heading type and level', async ({ editor, page }) => {
		await editor.focus();
		// Use input rule # for heading level 1
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('My Heading', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Normal paragraph', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const headingBefore: JsonChild | undefined = beforeJson.children.find(
			(c) => c.type === 'heading',
		);
		expect(headingBefore).toBeDefined();

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const heading: JsonChild | undefined = json.children.find((c) => c.type === 'heading');
		expect(heading).toBeDefined();
		expect(heading?.attrs?.level).toBe(1);
	});

	test('cut & paste blockquote preserves block type', async ({ editor, page }) => {
		await editor.focus();
		// Use input rule > for blockquote
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('A famous quote', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // exit blockquote
		await page.keyboard.type('After quote', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const bqBefore: JsonChild | undefined = beforeJson.children.find(
			(c) => c.type === 'blockquote',
		);
		expect(bqBefore).toBeDefined();

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const bq: JsonChild | undefined = json.children.find((c) => c.type === 'blockquote');
		expect(bq).toBeDefined();
		const bqText: string = (bq?.children ?? []).map((c) => c.text ?? '').join('');
		expect(bqText).toContain('A famous quote');
	});

	test('cut & paste mixed content preserves all block types', async ({ editor, page }) => {
		await editor.focus();

		// Create a heading
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Title', { delay: 10 });
		await page.keyboard.press('Enter');

		// Create a bullet list
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('List item', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // exit list

		// Create a normal paragraph
		await page.keyboard.type('Normal text', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		expect(beforeJson.children.find((c) => c.type === 'heading')).toBeDefined();
		expect(beforeJson.children.find((c) => c.type === 'list_item')).toBeDefined();
		expect(beforeJson.children.find((c) => c.type === 'paragraph')).toBeDefined();

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children.find((c) => c.type === 'heading')).toBeDefined();
		expect(json.children.find((c) => c.type === 'list_item')).toBeDefined();
		expect(json.children.find((c) => c.type === 'paragraph')).toBeDefined();
	});
});
