import { expect, test } from './fixtures/editor-page';

test.describe('Smart Paste — JSON', () => {
	const SAMPLE_JSON = '{"name":"John","age":30,"active":true}';
	const INVALID_JSON = '{"name": "John", age: 30}';

	test('pasting valid JSON creates a code_block with language=json', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText(SAMPLE_JSON);

		const json = await editor.getJSON();
		const block = json.children.find((b) => b.type === 'code_block');
		expect(block).toBeDefined();
		expect(block?.attrs?.language).toBe('json');
	});

	test('pasted JSON is pretty-printed', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText(SAMPLE_JSON);

		const json = await editor.getJSON();
		const block = json.children.find((b) => b.type === 'code_block');
		expect(block).toBeDefined();

		const text: string = block?.children?.[0]?.text ?? '';
		// Should contain indentation (2 spaces)
		expect(text).toContain('  "name"');
		expect(text).toContain('\n');
	});

	test('pasted JSON has syntax highlighting tokens in DOM', async ({ editor, page }) => {
		await editor.focus();
		await editor.pasteText(SAMPLE_JSON);

		// Wait for decorations to render
		await page.waitForTimeout(100);

		const tokenCount: number = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const shadow = el?.shadowRoot;
			if (!shadow) return 0;
			return shadow.querySelectorAll('[class*="notectl-token--"]').length;
		});

		expect(tokenCount).toBeGreaterThan(0);
	});

	test('theme switch updates token colors', async ({ editor, page }) => {
		await editor.focus();
		await editor.pasteText(SAMPLE_JSON);
		await page.waitForTimeout(100);

		// Get initial color of first token
		const getTokenColor = async (): Promise<string> =>
			page.evaluate(() => {
				const el = document.querySelector('notectl-editor');
				const shadow = el?.shadowRoot;
				if (!shadow) return '';
				const token = shadow.querySelector('[class*="notectl-token--"]');
				if (!token) return '';
				return getComputedStyle(token).color;
			});

		const lightColor: string = await getTokenColor();

		// Switch to dark theme
		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as unknown as {
				setTheme(t: string): void;
			};
			el?.setTheme('dark');
		});
		await page.waitForTimeout(100);

		const darkColor: string = await getTokenColor();

		// Colors should be different between light and dark themes
		expect(lightColor).not.toBe('');
		expect(darkColor).not.toBe('');
		expect(lightColor).not.toBe(darkColor);
	});

	test('pasting plain text does NOT create a code block', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText('Hello world, just some text');

		const json = await editor.getJSON();
		const codeBlocks = json.children.filter((b) => b.type === 'code_block');
		expect(codeBlocks.length).toBe(0);
	});

	test('pasting invalid JSON does NOT create a code block', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText(INVALID_JSON);

		const json = await editor.getJSON();
		const codeBlocks = json.children.filter((b) => b.type === 'code_block');
		expect(codeBlocks.length).toBe(0);
	});

	test('undo after JSON paste removes the code block', async ({ editor, page }) => {
		await editor.focus();
		await editor.pasteText(SAMPLE_JSON);

		const jsonBefore = await editor.getJSON();
		expect(jsonBefore.children.some((b) => b.type === 'code_block')).toBe(true);

		// Undo
		const isMac: boolean = await page.evaluate(() => navigator.platform.includes('Mac'));
		await page.keyboard.press(isMac ? 'Meta+z' : 'Control+z');

		const jsonAfter = await editor.getJSON();
		expect(jsonAfter.children.some((b) => b.type === 'code_block')).toBe(false);
	});

	test('pasting JSON array creates a code block', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText('[1, 2, 3, "hello"]');

		const json = await editor.getJSON();
		const block = json.children.find((b) => b.type === 'code_block');
		expect(block).toBeDefined();
		expect(block?.attrs?.language).toBe('json');
	});

	test('pasting minimal JSON ({} or []) does NOT create a code block', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText('{}');

		const json = await editor.getJSON();
		const codeBlocks = json.children.filter((b) => b.type === 'code_block');
		expect(codeBlocks.length).toBe(0);
	});

	test('pasting deeply nested multi-line JSON creates a code block', async ({ editor }) => {
		const glossaryJson = JSON.stringify({
			glossary: {
				title: 'example glossary',
				GlossDiv: {
					title: 'S',
					GlossList: {
						GlossEntry: {
							ID: 'SGML',
							SortAs: 'SGML',
							GlossTerm: 'Standard Generalized Markup Language',
							Acronym: 'SGML',
							Abbrev: 'ISO 8879:1986',
							GlossDef: {
								para: 'A meta-markup language, used to create markup languages such as DocBook.',
								GlossSeeAlso: ['GML', 'XML'],
							},
							GlossSee: 'markup',
						},
					},
				},
			},
		});
		await editor.focus();
		await editor.pasteText(glossaryJson);

		const json = await editor.getJSON();
		const block = json.children.find((b) => b.type === 'code_block');
		expect(block).toBeDefined();
		expect(block?.attrs?.language).toBe('json');

		const text: string = block?.children?.[0]?.text ?? '';
		expect(text).toContain('"glossary"');
		expect(text).toContain('"GlossEntry"');
		expect(text).toContain('"SGML"');
	});
});
