import { expect, test } from './fixtures/editor-page';

test.describe('Code Block — Auto-Indent & Bracket-Pairing', () => {
	// ── Auto-Indent ─────────────────────────────────────────────

	test('Enter inherits the leading whitespace', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('  fn()', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('next', { delay: 10 });

		const json = await editor.getJSON();
		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toBe('  fn()\n  next');
	});

	test('Enter inside `{|}` (after auto-pair) creates the 3-line block', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		// `{` auto-pairs to `{}` with cursor between them.
		await page.keyboard.type('function foo() {', { delay: 10 });
		await page.keyboard.press('Enter');

		const json = await editor.getJSON();
		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toBe('function foo() {\n\t\n}');
	});

	test('Enter between bare `{|}` creates the 3-line block pattern', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('{', { delay: 10 });
		// `{` triggers auto-pair → text is `{}` with cursor between.
		await page.keyboard.press('Enter');

		const json = await editor.getJSON();
		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toBe('{\n\t\n}');
	});

	// ── Multi-Line-Indent ───────────────────────────────────────

	test('Tab on a multi-line range indents every covered line', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		// Avoid Enter/auto-indent: type with Shift-Enter? Actually all Enter inserts \n.
		// Use plain text typed character by character — but `}` would auto-dedent.
		// Use a, b, c on separate lines.
		await page.keyboard.type('a', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('b', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('c', { delay: 10 });

		// Select all 3 lines via Ctrl/Cmd+A — but that would also select doc bounds.
		// Use Home + Shift+Ctrl+End to cover the whole code block instead.
		await page.keyboard.press('Home');
		await page.keyboard.press('ControlOrMeta+Home');
		await page.keyboard.press('ControlOrMeta+Shift+End');
		await page.keyboard.press('Tab');

		const json = await editor.getJSON();
		const text = json.children[0]?.children?.[0]?.text ?? '';
		// Each line should now start with one indent unit (\t).
		const lines = text.split('\n');
		expect(lines.every((l) => l.startsWith('\t'))).toBe(true);
	});

	// ── Bracket-Pairing ─────────────────────────────────────────

	test('typing `(` inserts auto-paired `()`', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('(', { delay: 10 });

		const json = await editor.getJSON();
		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toBe('()');
	});

	test('typing `(` with a range selection wraps the selection', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('abc', { delay: 10 });
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.type('(', { delay: 10 });

		const json = await editor.getJSON();
		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toBe('(abc)');
	});

	test("typing `'` after a word char does NOT pair (apostrophe context)", async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type("don't", { delay: 10 });

		const json = await editor.getJSON();
		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toBe("don't");
	});

	test('Backspace between auto-paired `(|)` removes both', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('(', { delay: 10 });
		// Cursor is now between `(` and `)`
		await page.keyboard.press('Backspace');

		const json = await editor.getJSON();
		const text = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toBe('');
	});
});
