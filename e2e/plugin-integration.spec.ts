import { expect, test } from './fixtures/editor-page';

test.describe('Plugin Integration — All Plugins Loaded', () => {
	// ── Toolbar presence ────────────────────────────────────────

	test('all expected toolbar buttons are rendered', async ({ editor }) => {
		const expectedButtons: string[] = [
			'bold',
			'italic',
			'underline',
			'strikethrough',
			'textColor',
			'heading',
			'blockquote',
			'alignment',
			'link',
			'list-bullet',
			'list-ordered',
			'list-checklist',
			'horizontal-rule',
		];

		for (const id of expectedButtons) {
			await expect(editor.markButton(id)).toBeVisible();
		}
	});

	test('toolbar has role="toolbar" and contains buttons for each plugin', async ({ editor }) => {
		const toolbar = editor.toolbar();
		await expect(toolbar).toBeVisible();
		await expect(toolbar).toHaveAttribute('role', 'toolbar');

		const buttons = toolbar.locator('button');
		const count = await buttons.count();
		expect(count).toBeGreaterThanOrEqual(13);
	});

	// ── Heading Plugin ──────────────────────────────────────────

	test('heading dropdown opens and shows levels', async ({ editor, page }) => {
		await editor.focus();
		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		// Popup is appended directly to the ShadowRoot
		const dropdown = page.locator('.notectl-toolbar-popup');
		await expect(dropdown).toBeVisible();
	});

	test('Mod-Shift-1 converts paragraph to heading level 1', async ({ editor, page }) => {
		await editor.typeText('My Heading');
		await page.keyboard.press('Control+Shift+1');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(1);
	});

	test('Mod-Shift-2 through Mod-Shift-6 set heading levels', async ({ editor, page }) => {
		await editor.focus();

		for (let level = 2; level <= 6; level++) {
			await page.keyboard.type('Heading', { delay: 10 });
			await page.keyboard.press(`Control+Shift+${level}`);

			const json = await editor.getJSON();
			const lastBlock = json.children[json.children.length - 1];
			expect(lastBlock?.type).toBe('heading');
			expect(lastBlock?.attrs?.level).toBe(level);

			await page.keyboard.press('Enter');
		}
	});

	test('heading toggle — pressing same shortcut reverts to paragraph', async ({ editor, page }) => {
		await editor.typeText('Toggle');
		await page.keyboard.press('Control+Shift+1');

		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');

		await page.keyboard.press('Control+Shift+1');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	// ── Blockquote Plugin ───────────────────────────────────────

	test('blockquote toolbar button converts paragraph to blockquote', async ({ editor }) => {
		await editor.typeText('A wise quote');
		const btn = editor.markButton('blockquote');
		await btn.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('blockquote');
	});

	test('blockquote button toggles back to paragraph', async ({ editor }) => {
		await editor.typeText('Toggle quote');
		const btn = editor.markButton('blockquote');

		await btn.click();
		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('blockquote');

		await btn.click();
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	test('blockquote renders with correct DOM element', async ({ editor, page }) => {
		await editor.typeText('Quote text');
		await editor.markButton('blockquote').click();

		// Verify the DOM renders a <blockquote> element inside the content area
		const blockquote = editor.content.locator('blockquote');
		await expect(blockquote).toBeVisible();
		await expect(blockquote).toContainText('Quote text');
	});

	// ── Strikethrough Plugin ────────────────────────────────────

	test('Mod-Shift-X toggles strikethrough', async ({ editor, page }) => {
		await editor.typeText('deleted text');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+Shift+x');

		const html = await editor.getHTML();
		expect(html).toContain('<s>');

		// Toggle off
		await page.keyboard.press('Control+Shift+x');
		const html2 = await editor.getHTML();
		expect(html2).not.toContain('<s>');
	});

	test('strikethrough toolbar button applies mark', async ({ editor, page }) => {
		await editor.typeText('strikethrough');
		await page.keyboard.press('Control+a');

		const btn = editor.markButton('strikethrough');
		await btn.click();

		const html = await editor.getHTML();
		expect(html).toContain('<s>');
	});

	// ── Horizontal Rule Plugin ──────────────────────────────────

	test('horizontal rule toolbar button inserts HR', async ({ editor }) => {
		await editor.typeText('Above');
		const btn = editor.markButton('horizontal-rule');
		await btn.click();

		const json = await editor.getJSON();
		const types = json.children.map((c: { type: string }) => c.type);
		expect(types).toContain('horizontal_rule');
	});

	test('HR inserts a new paragraph after it', async ({ editor }) => {
		await editor.focus();
		const btn = editor.markButton('horizontal-rule');
		await btn.click();

		const json = await editor.getJSON();
		expect(json.children.length).toBeGreaterThanOrEqual(2);
		const lastBlock = json.children[json.children.length - 1];
		expect(lastBlock?.type).toBe('paragraph');
	});

	// ── Text Alignment Plugin ───────────────────────────────────

	test('Mod-Shift-E centers text (verified via DOM)', async ({ editor, page }) => {
		await editor.typeText('Centered');
		await page.keyboard.press('Control+Shift+e');

		// The alignment is applied as inline style in the DOM
		const centered = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('[data-block-id]') as HTMLElement | undefined;
			return el?.style.textAlign;
		});
		expect(centered).toBe('center');
	});

	test('Mod-Shift-R right-aligns text (verified via DOM)', async ({ editor, page }) => {
		await editor.typeText('Right');
		await page.keyboard.press('Control+Shift+r');

		const align = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('[data-block-id]') as HTMLElement | undefined;
			return el?.style.textAlign;
		});
		expect(align).toBe('right');
	});

	test('Mod-Shift-J justifies text (verified via DOM)', async ({ editor, page }) => {
		await editor.typeText('Justified text here');
		await page.keyboard.press('Control+Shift+j');

		const align = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('[data-block-id]') as HTMLElement | undefined;
			return el?.style.textAlign;
		});
		expect(align).toBe('justify');
	});

	test('Mod-Shift-L resets to left alignment', async ({ editor, page }) => {
		await editor.typeText('Left');
		await page.keyboard.press('Control+Shift+e');

		let align = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('[data-block-id]') as HTMLElement | undefined;
			return el?.style.textAlign;
		});
		expect(align).toBe('center');

		await page.keyboard.press('Control+Shift+l');
		align = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('[data-block-id]') as HTMLElement | undefined;
			return el?.style.textAlign;
		});
		expect(align === 'left' || align === '').toBe(true);
	});

	test('alignment dropdown opens with options', async ({ editor, page }) => {
		await editor.focus();
		const alignBtn = editor.markButton('alignment');
		await alignBtn.click();

		const popup = page.locator('.notectl-toolbar-popup');
		await expect(popup).toBeVisible();
	});

	// ── Text Color Plugin ───────────────────────────────────────

	test('text color toolbar button opens color picker popup', async ({ editor, page }) => {
		await editor.typeText('Colored');
		await page.keyboard.press('Control+a');

		const colorBtn = editor.markButton('textColor');
		await colorBtn.click();

		const popup = page.locator('.notectl-toolbar-popup');
		await expect(popup).toBeVisible();
	});

	test('selecting a color applies textColor mark', async ({ editor, page }) => {
		await editor.typeText('Red text');
		await page.keyboard.press('Control+a');

		const colorBtn = editor.markButton('textColor');
		await colorBtn.click();

		// Click a color swatch (not the "Default" button)
		const swatch = page.locator('.notectl-color-picker__swatch').first();
		await expect(swatch).toBeVisible();
		await swatch.click();

		const html = await editor.getHTML();
		expect(html).toContain('color:');
	});

	// ── Link Plugin ─────────────────────────────────────────────

	test('link toolbar button is visible', async ({ editor }) => {
		const linkBtn = editor.markButton('link');
		await expect(linkBtn).toBeVisible();
	});

	test('link toolbar button opens popup when text is selected', async ({ editor, page }) => {
		await editor.typeText('Link me');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		const linkBtn = editor.markButton('link');
		await linkBtn.click();

		const popup = page.locator('.notectl-toolbar-popup');
		await expect(popup).toBeVisible();
	});

	// ── List Plugin — all three types ───────────────────────────

	test('bullet list toolbar button creates bullet list', async ({ editor }) => {
		await editor.typeText('Item');
		const btn = editor.markButton('list-bullet');
		await btn.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('bullet');
	});

	test('ordered list toolbar button creates ordered list', async ({ editor }) => {
		await editor.typeText('First');
		const btn = editor.markButton('list-ordered');
		await btn.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('ordered');
	});

	test('checklist toolbar button creates checklist', async ({ editor }) => {
		await editor.typeText('Task');
		const btn = editor.markButton('list-checklist');
		await btn.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('checklist');
		expect(json.children[0]?.attrs?.checked).toBe(false);
	});

	test('switching between list types preserves text', async ({ editor }) => {
		await editor.typeText('Switch me');

		await editor.markButton('list-bullet').click();
		let json = await editor.getJSON();
		expect(json.children[0]?.attrs?.listType).toBe('bullet');

		await editor.markButton('list-ordered').click();
		json = await editor.getJSON();
		expect(json.children[0]?.attrs?.listType).toBe('ordered');

		await editor.markButton('list-checklist').click();
		json = await editor.getJSON();
		expect(json.children[0]?.attrs?.listType).toBe('checklist');

		const text = await editor.getText();
		expect(text.trim()).toBe('Switch me');
	});

	// ── Cross-plugin: formatting inside block types ─────────────

	test('bold inside heading', async ({ editor, page }) => {
		await editor.typeText('Bold Heading');
		await page.keyboard.press('Control+Shift+1');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
	});

	test('formatting marks inside blockquote', async ({ editor, page }) => {
		await editor.typeText('Styled quote');

		const btn = editor.markButton('blockquote');
		await btn.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('blockquote');

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+i');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
	});

	test('strikethrough inside list item', async ({ editor, page }) => {
		await editor.typeText('Done task');
		await editor.markButton('list-checklist').click();
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+Shift+x');

		const html = await editor.getHTML();
		expect(html).toContain('<s>');
		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
	});

	test('text alignment on heading (verified via DOM)', async ({ editor, page }) => {
		await editor.typeText('Centered Heading');
		await page.keyboard.press('Control+Shift+1');
		await page.keyboard.press('Control+Shift+e');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');

		const align = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('[data-block-id]') as HTMLElement | undefined;
			return el?.style.textAlign;
		});
		expect(align).toBe('center');
	});
});
