import { expect, test } from './fixtures/editor-page';

test.use({
	permissions: ['clipboard-read', 'clipboard-write'],
});

test('Ctrl+V paste from system clipboard triggers rich paste', async ({ editor, page }) => {
	await editor.focus();

	// Create a bullet list
	await page.keyboard.type('- ', { delay: 10 });
	await page.keyboard.type('Test item', { delay: 10 });

	// Select and copy
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');
	await page.keyboard.press('Control+c');
	await page.waitForTimeout(200);

	// Install a paste spy BEFORE doing Ctrl+V
	await page.evaluate(() => {
		const el = document.querySelector('notectl-editor');
		const content = el?.shadowRoot?.querySelector('.notectl-content');
		if (!content) return;

		const handler = (e: ClipboardEvent) => {
			const data = e.clipboardData;
			(window as unknown as Record<string, unknown>).__pasteDebug = {
				plainText: data?.getData('text/plain') ?? null,
				html: (data?.getData('text/html') ?? '').substring(0, 300),
				types: data ? Array.from(data.types) : [],
			};
		};
		content.addEventListener('paste', handler, true);
	});

	// Move to new paragraph, then paste with real Ctrl+V
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter'); // exit list
	await page.keyboard.press('Control+v');
	await page.waitForTimeout(300);

	// Read the paste debug info
	const pasteDebug = await page.evaluate(() => {
		return (window as unknown as Record<string, unknown>).__pasteDebug as Record<
			string,
			unknown
		>;
	});

	// biome-ignore lint/suspicious/noConsoleLog: debug test
	console.log('Real paste event data:', JSON.stringify(pasteDebug, null, 2));

	type JsonChild = {
		type: string;
		children?: JsonChild[];
		attrs?: Record<string, unknown>;
		text?: string;
	};

	const json: { children: JsonChild[] } = await editor.getJSON();
	// biome-ignore lint/suspicious/noConsoleLog: debug test
	console.log(
		'Doc children types:',
		json.children.map((c) => c.type),
	);

	// Check if the last block is a list_item (rich paste worked)
	const lastChild = json.children[json.children.length - 1];
	// biome-ignore lint/suspicious/noConsoleLog: debug test
	console.log('Last child type:', lastChild?.type);
	expect(lastChild?.type).toBe('list_item');
});
