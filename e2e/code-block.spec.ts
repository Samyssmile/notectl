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

	test('code block has non-editable header with language label', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```typescript ', { delay: 10 });

		const header = editor.content.locator('.notectl-code-block__header');
		await expect(header).toBeVisible();

		const langLabel = editor.content.locator('.notectl-code-block__language');
		await expect(langLabel).toHaveText('typescript');
	});

	// ── Keyboard shortcut ──────────────────────────────────────

	// ── Toolbar button ─────────────────────────────────────────

	test('toolbar code block button creates a code block', async ({ editor }) => {
		await editor.focus();
		const btn = editor.markButton('code_block');
		await btn.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');
	});

	// ── Escape code block: ArrowDown ──────────────────────────

	test('ArrowDown on single-line code block exits', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('single line', { delay: 10 });

		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);
		await page.keyboard.type('new paragraph', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[1]?.type).toBe('paragraph');
		expect(json.children[1]?.children?.[0]?.text).toContain('new paragraph');
	});

	test('ArrowDown does not exit from middle line', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('line 1', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('line 2', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('line 3', { delay: 10 });

		// Move cursor to end of line 1
		await page.keyboard.press('Home');
		for (let i = 0; i < 20; i++) {
			await page.keyboard.press('ArrowLeft');
		}
		// At this point cursor is near start; ArrowDown should stay in code block
		await page.keyboard.press('ArrowDown');

		const json = await editor.getJSON();
		// Should still be one code block (no new paragraph created)
		expect(json.children[0]?.type).toBe('code_block');
	});

	// ── Escape code block: ArrowUp ────────────────────────────

	test('ArrowUp at start of code block exits to previous block', async ({ editor, page }) => {
		// Type a paragraph first, then create a code block
		await editor.typeText('paragraph above');
		await page.keyboard.press('Enter');
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('code here', { delay: 10 });

		// Move to start of code block
		await page.keyboard.press('Home');
		// Press ArrowUp — should go to paragraph above
		await page.keyboard.press('ArrowUp');

		// Now type to verify we're in the paragraph
		await page.keyboard.press('End');
		await page.keyboard.type(' edited', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
		expect(json.children[0]?.children?.[0]?.text).toContain('edited');
	});

	// ── Escape code block: Escape key ─────────────────────────

	// ── Escape code block: Backspace at start ─────────────────

	test('Backspace at start of code block converts to paragraph', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('hello', { delay: 10 });

		// Move cursor to start — use ArrowLeft for reliable offset positioning
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowLeft');
		}
		await page.waitForTimeout(50);
		await page.keyboard.press('Backspace');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
		expect(json.children[0]?.children?.[0]?.text).toContain('hello');
	});

	// ── Click below code block ────────────────────────────────

	test('clicking below code block creates paragraph', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('code content', { delay: 10 });

		// Get the content area bounding box and click near the bottom
		const contentBox = await editor.content.boundingBox();
		expect(contentBox).not.toBeNull();
		if (!contentBox) return;

		// Click well below the code block (near the bottom of the content area)
		await page.mouse.click(
			contentBox.x + contentBox.width / 2,
			contentBox.y + contentBox.height - 10,
		);
		await page.waitForTimeout(100);
		await page.keyboard.type('clicked below', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[1]?.type).toBe('paragraph');
		expect(json.children[1]?.children?.[0]?.text).toContain('clicked below');
	});

	// ── Tab indentation ──────────────────────────────────────

	test('Tab inserts tab character in code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.press('Tab');
		await page.keyboard.type('indented', { delay: 10 });

		const json = await editor.getJSON();
		const text: string = json.children[0]?.children?.[0]?.text ?? '';
		expect(text).toContain('\tindented');
	});

	test('Shift-Tab removes leading tab from current line', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.press('Tab');
		await page.keyboard.type('indented line', { delay: 10 });

		// Shift-Tab should remove the leading tab
		await page.keyboard.press('Shift+Tab');

		const json = await editor.getJSON();
		const text: string = json.children[0]?.children?.[0]?.text ?? '';
		// Tab should be removed, only text remains
		expect(text).toBe('indented line');
	});

	// ── Toggle code block ↔ paragraph ────────────────────────

	test('Ctrl+Shift+C toggles code block back to paragraph', async ({ editor, page }) => {
		await editor.typeText('plain text');

		// Toggle to code block
		await page.keyboard.press('Control+Shift+C');
		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');

		// Toggle back to paragraph
		await page.keyboard.press('Control+Shift+C');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
		expect(json.children[0]?.children?.[0]?.text).toContain('plain text');
	});

	test('toolbar toggle: code block → paragraph preserves text', async ({ editor }) => {
		await editor.focus();
		const btn = editor.markButton('code_block');

		// Toggle to code block, type text
		await btn.click();
		await editor.page.keyboard.type('code content', { delay: 10 });

		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');

		// Toggle back to paragraph
		await btn.click();
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
		expect(json.children[0]?.children?.[0]?.text).toContain('code content');
	});

	// ── Mark prevention ──────────────────────────────────────

	test('bold shortcut has no effect inside code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('plain code', { delay: 10 });

		// Select all text in the code block
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');

		// Try to apply bold
		await page.keyboard.press('Control+b');

		const json = await editor.getJSON();
		const block = json.children[0];
		expect(block?.type).toBe('code_block');
		// Text should have no marks
		const marks = block?.children?.[0]?.marks ?? [];
		expect(marks.length).toBe(0);
	});

	test('italic shortcut has no effect inside code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('plain code', { delay: 10 });

		// Select all text
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');

		// Try to apply italic
		await page.keyboard.press('Control+i');

		const json = await editor.getJSON();
		const marks = json.children[0]?.children?.[0]?.marks ?? [];
		expect(marks.length).toBe(0);
	});

	test('converting bold text to code block strips marks', async ({ editor, page }) => {
		await editor.focus();

		// Type bold text
		await page.keyboard.press('Control+b');
		await page.keyboard.type('bold text', { delay: 10 });
		await page.keyboard.press('Control+b');

		// Verify bold is applied
		let json = await editor.getJSON();
		expect(json.children[0]?.children?.[0]?.marks?.length).toBeGreaterThan(0);

		// Convert to code block via shortcut
		await page.keyboard.press('Control+Shift+C');

		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('code_block');
		// Marks must be stripped
		const marks = json.children[0]?.children?.[0]?.marks ?? [];
		expect(marks.length).toBe(0);
	});

	// ── Copy button ──────────────────────────────────────────

	test('copy button is visible in code block header', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('copyable code', { delay: 10 });

		const copyBtn = editor.content.locator('.notectl-code-block__copy');
		await expect(copyBtn).toBeVisible();
		await expect(copyBtn).toHaveAttribute('aria-label', 'Copy code');
	});

	test('copy button copies code block text to clipboard', async ({ editor, page, context }) => {
		try {
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		} catch {
			// Best-effort: some browsers do not expose clipboard permissions via Playwright.
		}

		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('const x = 42;', { delay: 10 });

		const copyBtn = editor.content.locator('.notectl-code-block__copy');
		await copyBtn.click();

		// Read clipboard content
		const clipboardText: string = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboardText).toBe('const x = 42;');
	});

	test('copy button announces to screen reader', async ({ editor, page, context }) => {
		try {
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		} catch {
			// Best-effort: some browsers do not expose clipboard permissions via Playwright.
		}

		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('code', { delay: 10 });

		const copyBtn = editor.content.locator('.notectl-code-block__copy');
		await copyBtn.click();
		await page.waitForTimeout(100);

		// Check the live region inside the code block header for copy feedback
		const srText: string = await editor.content
			.locator('.notectl-code-block__header .notectl-sr-only')
			.evaluate((el) => el.textContent ?? '');
		expect(srText).toContain('Copied to clipboard');
	});

	// ── CSS Custom Properties ─────────────────────────────────

	test('code block respects CSS custom properties for theming', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('themed', { delay: 10 });

		// Set CSS custom properties on the editor
		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			if (!el) return;
			(el as HTMLElement).style.setProperty('--notectl-code-block-bg', '#ffffff');
			(el as HTMLElement).style.setProperty('--notectl-code-block-header-bg', '#f0f0f0');
		});

		// Wait for reflow
		await page.waitForTimeout(100);

		// Verify the code block uses the custom property values
		const bgColor = await editor.content
			.locator('pre.notectl-code-block')
			.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bgColor).toBe('rgb(255, 255, 255)');

		const headerBg = await editor.content
			.locator('.notectl-code-block__header')
			.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(headerBg).toBe('rgb(240, 240, 240)');
	});
});

// ── Code Block Accessibility ─────────────────────────────────

test.describe('Code Block Accessibility', () => {
	test('Escape exits code block (no keyboard trap)', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('some code', { delay: 10 });

		await page.keyboard.press('Escape');
		await page.keyboard.type('escaped', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.type).toBe('code_block');
		expect(json.children[1]?.type).toBe('paragraph');
		expect(json.children[1]?.children?.[0]?.text).toContain('escaped');
	});

	test('ArrowDown at last line exits code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('line1', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('line2', { delay: 10 });

		await page.keyboard.press('ArrowDown');
		// Wait for the new paragraph block to appear in the DOM
		await editor.content.locator('p[data-block-id]').waitFor({ state: 'attached' });
		await page.keyboard.type('outside', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.type).toBe('code_block');
		expect(json.children[1]?.type).toBe('paragraph');

		const text = await editor.getText();
		expect(text).toContain('outside');
	});

	test('ArrowRight at end exits code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('code', { delay: 10 });

		// Cursor is at end after typing. Press ArrowRight to exit.
		await page.keyboard.press('ArrowRight');
		await page.keyboard.type('next', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.type).toBe('code_block');
		expect(json.children[1]?.type).toBe('paragraph');
		expect(json.children[1]?.children?.[0]?.text).toContain('next');
	});

	test('ArrowLeft at start exits code block', async ({ editor, page }) => {
		// Create a paragraph first, then an empty code block
		await editor.typeText('above');
		await page.keyboard.press('Enter');
		await page.keyboard.type('``` ', { delay: 10 });

		// Cursor is at offset 0 in the empty code block.
		// Press ArrowLeft to exit to previous block.
		await page.keyboard.press('ArrowLeft');

		// Verify cursor is now in the paragraph above
		await page.keyboard.press('End');
		await page.keyboard.type(' edited', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
		expect(json.children[0]?.children?.[0]?.text).toContain('edited');
	});

	test('Mod+Shift+Enter creates paragraph below', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('code here', { delay: 10 });

		// Press Mod+Shift+Enter to create paragraph below
		await page.keyboard.press('Control+Shift+Enter');
		await page.keyboard.type('new paragraph', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.type).toBe('code_block');
		expect(json.children[1]?.type).toBe('paragraph');
		expect(json.children[1]?.children?.[0]?.text).toContain('new paragraph');
	});

	test('code block has ARIA attributes', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('```typescript ', { delay: 10 });
		await page.keyboard.type('code', { delay: 10 });

		const pre = editor.content.locator('pre.notectl-code-block');
		await expect(pre).toHaveAttribute('role', 'group');
		await expect(pre).toHaveAttribute('aria-roledescription', 'code block');
		await expect(pre).toHaveAttribute('aria-label', 'typescript code block. Press Escape to exit.');
	});

	test('escape hint visible when focused', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('code', { delay: 10 });

		// Wait for focused class to be applied via onStateChange
		await page.waitForTimeout(100);

		const hint = editor.content.locator('.notectl-code-block__esc-hint');
		await expect(hint).toBeVisible();

		// Exit code block
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		// Hint should be hidden now (no --focused class)
		await expect(hint).not.toBeVisible();
	});

	test('screen reader announces entering code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.waitForTimeout(100);

		const announcer = editor.announcer();
		const text: string = await announcer.evaluate((el) => el.textContent ?? '');
		expect(text).toContain('Entered code block');
	});

	test('screen reader announces leaving code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.type('code', { delay: 10 });
		await page.waitForTimeout(100);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		const announcer = editor.announcer();
		const text: string = await announcer.evaluate((el) => el.textContent ?? '');
		expect(text).toContain('Left code block');
	});
});
