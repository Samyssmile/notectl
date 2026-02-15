import { expect, test } from './fixtures/editor-page';

test.describe('Code Block Plugin', () => {
	// ── Input rule: ``` creates code block ─────────────────────

	test('``` + space creates a code_block via input rule', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');
	});

	test('```java + space creates code_block with language attr', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```java ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');
		expect(json.children[0]?.attrs?.language).toBe('java');
	});

	test('code_block has default attrs (language, backgroundColor)', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });

		const json = await editor.getJSON();
		const block = json.children[0];
		expect(block?.type).toBe('code_block');
		// attrs should not be empty — defaults must be applied
		expect(block?.attrs).toBeDefined();
		expect(block?.attrs).toHaveProperty('language');
		expect(block?.attrs).toHaveProperty('backgroundColor');
	});

	// ── Typing into code block ─────────────────────────────────

	test('can type text into a code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('hello world', { delay: 10 });

		const json = await editor.getJSON();
		const block = json.children[0];
		expect(block?.type).toBe('code_block');
		expect(block?.children?.[0]?.text).toContain('hello world');
	});

	test('can type a Java main method into a code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```java ', { delay: 10 });

		// Type a Java main method
		const javaCode = 'public static void main(String[] args)';
		await page.keyboard.type(javaCode, { delay: 10 });

		const json = await editor.getJSON();
		const block = json.children[0];
		expect(block?.type).toBe('code_block');
		expect(block?.children?.[0]?.text).toContain('public static void main');
	});

	test('Enter inside code block inserts newline, not new paragraph', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('line 1', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('line 2', { delay: 10 });

		const json = await editor.getJSON();
		// Should still be one code block, not two blocks
		expect(json.children.length).toBe(1);
		expect(json.children[0]?.type).toBe('code_block');

		// Text should contain both lines
		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toContain('line 1');
		expect(text).toContain('line 2');
	});

	// ── Visual rendering (DOM) ─────────────────────────────────

	test('code block renders as <pre> element in DOM', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('some code', { delay: 10 });

		const pre = editor.content.locator('pre.notectl-code-block');
		await expect(pre).toBeVisible();
	});

	test('code block renders <code> content area', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('some code', { delay: 10 });

		const code = editor.content.locator('pre.notectl-code-block code');
		await expect(code).toBeVisible();
		await expect(code).toContainText('some code');
	});

	test('code block has non-editable header with language label', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```typescript ', { delay: 10 });

		const header = editor.content.locator('.notectl-code-block__header');
		await expect(header).toBeVisible();

		const langLabel = editor.content.locator('.notectl-code-block__language');
		await expect(langLabel).toHaveText('typescript');
	});

	// ── Keyboard shortcut ──────────────────────────────────────

	test('Ctrl+Shift+M toggles code block', async ({ editor, page }) => {
		await editor.typeText('some text');
		await page.keyboard.press('Control+Shift+M');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');
		expect(json.children[0]?.children?.[0]?.text).toContain('some text');
	});

	// ── Toolbar button ─────────────────────────────────────────

	test('toolbar code block button creates a code block', async ({ editor }) => {
		await editor.focus();
		const btn = editor.markButton('code_block');
		await btn.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');
	});
});
