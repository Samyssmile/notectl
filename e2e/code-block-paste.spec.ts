import { expect, test } from './fixtures/editor-page';

test.describe('Code Block — Java Language & Paste', () => {
	test('```java + space sets language attribute to "java"', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```java ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');
		expect(json.children[0]?.attrs?.language).toBe('java');
	});

	test('language label shows "java" in DOM', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```java ', { delay: 10 });

		const langLabel = editor.content.locator('.notectl-code-block__language');
		await expect(langLabel).toHaveText('java');
	});

	test('typing Java code produces syntax highlighting tokens', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```java ', { delay: 10 });
		await page.keyboard.type('public void main()', { delay: 10 });

		const tokenElements = editor.content.locator('[class*="notectl-token--"]');
		const count = await tokenElements.count();
		expect(count).toBeGreaterThan(0);

		// Verify specific token types
		const keywordTokens = editor.content.locator('.notectl-token--keyword');
		await expect(keywordTokens.first()).toHaveText('public');

		const functionTokens = editor.content.locator('.notectl-token--function');
		await expect(functionTokens.first()).toHaveText('main');
	});

	test('pasting multiline Java code stays in single code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```java ', { delay: 10 });

		const javaCode =
			'public class Hello {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}';
		await editor.pasteText(javaCode);
		await page.waitForTimeout(200);

		const json = await editor.getJSON();
		// All code must stay in a single code block
		expect(json.children.length).toBe(1);
		expect(json.children[0]?.type).toBe('code_block');

		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toContain('public class Hello');
		expect(text).toContain('System.out.println');
		expect(text).toContain('}');
	});

	test('pasting plain text into code block preserves newlines', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });

		await editor.pasteText('line 1\nline 2\nline 3');
		await page.waitForTimeout(100);

		const json = await editor.getJSON();
		expect(json.children.length).toBe(1);
		expect(json.children[0]?.type).toBe('code_block');

		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toBe('line 1\nline 2\nline 3');
	});
});
