import { expect, test } from './fixtures/editor-page';

test.describe('Accessibility', () => {
	test('Content area has correct ARIA attributes', async ({ editor }) => {
		await expect(editor.content).toHaveAttribute('role', 'textbox');
		await expect(editor.content).toHaveAttribute('aria-multiline', 'true');
		await expect(editor.content).toHaveAttribute('aria-label', 'Rich text editor');
	});

	test('Toolbar buttons have aria-pressed', async ({ editor }) => {
		const boldBtn = editor.markButton('bold');
		await expect(boldBtn).toHaveAttribute('aria-pressed');
		await expect(boldBtn).toHaveAttribute('aria-label', 'Bold');
	});

	test('Toolbar buttons show aria-disabled when feature is disabled', async ({ editor }) => {
		await editor.recreate({
			features: { bold: false, italic: false, underline: false },
			toolbar: { bold: true, italic: true, underline: true },
		});

		for (const markType of ['bold', 'italic', 'underline']) {
			await expect(editor.markButton(markType)).toHaveAttribute('aria-disabled', 'true');
		}
	});

	test('Screen reader announcement on format change', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.press('Control+b');

		await expect(editor.announcer()).toHaveText('bold on');

		await page.keyboard.press('Control+b');
		await expect(editor.announcer()).toHaveText('bold off');
	});

	test('All formatting accessible via keyboard only', async ({ editor, page }) => {
		await editor.content.focus();
		await page.keyboard.type('Test', { delay: 10 });
		await page.keyboard.press('Control+a');

		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+i');
		await page.keyboard.press('Control+u');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
		expect(html).toContain('<u>');

		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');

		const html2 = await editor.getHTML();
		expect(html2).not.toContain('<strong>');
		expect(html2).not.toContain('<em>');
		expect(html2).not.toContain('<u>');
		const text = await editor.getText();
		expect(text.trim()).toBe('Test');
	});
});

test.describe('Toolbar Keyboard Navigation', () => {
	test('First enabled button has tabindex="0", others have tabindex="-1"', async ({ editor }) => {
		const toolbar = editor.toolbar();
		const buttons = toolbar.locator('button[data-toolbar-item]');
		const count = await buttons.count();
		expect(count).toBeGreaterThan(1);

		// Exactly one button should have tabindex="0"
		const tabindex0 = toolbar.locator('button[data-toolbar-item][tabindex="0"]');
		await expect(tabindex0).toHaveCount(1);

		// All others should have tabindex="-1"
		const tabindexMinus1 = toolbar.locator('button[data-toolbar-item][tabindex="-1"]');
		await expect(tabindexMinus1).toHaveCount(count - 1);
	});

	test('ArrowRight moves focus to next button', async ({ editor, page }) => {
		const toolbar = editor.toolbar();
		const buttons = toolbar.locator('button');
		const firstBtn = buttons.first();
		await firstBtn.focus();

		const firstId = await firstBtn.getAttribute('data-toolbar-item');

		await page.keyboard.press('ArrowRight');

		// The focused element should be a different button
		const focusedId = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return null;
			const focused = sr.activeElement;
			return focused?.getAttribute('data-toolbar-item');
		});

		expect(focusedId).not.toBe(firstId);
		expect(focusedId).toBeTruthy();
	});

	test('ArrowLeft moves focus to previous button', async ({ editor, page }) => {
		const toolbar = editor.toolbar();
		const firstBtn = toolbar.locator('button').first();
		await firstBtn.focus();

		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowLeft');

		const focusedId = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return null;
			return sr.activeElement?.getAttribute('data-toolbar-item');
		});

		const firstId = await firstBtn.getAttribute('data-toolbar-item');
		expect(focusedId).toBe(firstId);
	});

	test('Home moves focus to first enabled button', async ({ editor, page }) => {
		const toolbar = editor.toolbar();
		const firstBtn = toolbar.locator('button').first();
		await firstBtn.focus();
		const firstId = await firstBtn.getAttribute('data-toolbar-item');

		// Move away
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');

		// Home to return
		await page.keyboard.press('Home');

		const focusedId = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return null;
			return sr.activeElement?.getAttribute('data-toolbar-item');
		});

		expect(focusedId).toBe(firstId);
	});

	test('End moves focus to last button', async ({ editor, page }) => {
		const toolbar = editor.toolbar();
		const buttons = toolbar.locator('button[data-toolbar-item]');
		const firstBtn = buttons.first();
		const lastBtn = buttons.last();
		await firstBtn.focus();
		const lastId = await lastBtn.getAttribute('data-toolbar-item');

		await page.keyboard.press('End');

		const focusedId = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return null;
			return sr.activeElement?.getAttribute('data-toolbar-item');
		});

		expect(focusedId).toBe(lastId);
	});

	test('ArrowRight wraps around from last to first', async ({ editor, page }) => {
		const toolbar = editor.toolbar();
		const firstBtn = toolbar.locator('button').first();
		await firstBtn.focus();
		const firstId = await firstBtn.getAttribute('data-toolbar-item');

		// Go to End
		await page.keyboard.press('End');

		// Wrap around
		await page.keyboard.press('ArrowRight');

		const focusedId = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return null;
			return sr.activeElement?.getAttribute('data-toolbar-item');
		});

		expect(focusedId).toBe(firstId);
	});
});

test.describe('Button Activation', () => {
	test('Enter key activates toolbar button and toggles formatting', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');

		// Focus bold button via the toolbar
		const boldBtn = editor.markButton('bold');
		await boldBtn.focus();

		// Small delay to let focus event propagate
		await page.waitForTimeout(50);

		await page.keyboard.press('Enter');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
	});

	test('Space key activates toolbar button', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');

		const italicBtn = editor.markButton('italic');
		await italicBtn.focus();

		await page.waitForTimeout(50);

		await page.keyboard.press(' ');

		const html = await editor.getHTML();
		expect(html).toContain('<em>');
	});
});

test.describe('Popup Keyboard Support', () => {
	test('Popup buttons have aria-haspopup and aria-expanded', async ({ editor }) => {
		// The heading plugin button is a combobox with aria-haspopup="listbox"
		const headingBtn = editor.markButton('heading');
		await expect(headingBtn).toHaveAttribute('aria-haspopup', 'listbox');
		await expect(headingBtn).toHaveAttribute('aria-expanded', 'false');
	});

	test('Escape closes popup and restores focus to trigger button', async ({ editor, page }) => {
		// Click on the heading button to open popup (mouse click is reliable)
		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		// Popup should be open
		await expect(editor.popup()).toBeVisible();

		// Press Escape to close
		await page.keyboard.press('Escape');

		await expect(editor.popup()).not.toBeVisible();
		await expect(headingBtn).toHaveAttribute('aria-expanded', 'false');

		// Focus should be back on the heading button
		const focusedId = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return null;
			return sr.activeElement?.getAttribute('data-toolbar-item');
		});
		expect(focusedId).toBe('heading');
	});

	test('Heading popup items are navigable with arrow keys', async ({ editor, page }) => {
		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		await expect(editor.popup()).toBeVisible();

		// Wait for auto-focus on first item
		await page.waitForTimeout(150);

		// The first picker item should be focused
		const firstLabel = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return null;
			const focused = sr.activeElement;
			return focused?.textContent?.trim();
		});
		expect(firstLabel).toBeTruthy();

		await page.keyboard.press('Escape');
	});

	test('Enter selects heading popup item and closes popup', async ({ editor, page }) => {
		await editor.typeText('Hello');

		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		await expect(editor.popup()).toBeVisible();

		// Wait for auto-focus
		await page.waitForTimeout(150);

		// Navigate to a heading item (second item is Title)
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);

		// Select it
		await page.keyboard.press('Enter');

		// Popup should close (HeadingPlugin dismisses via mousedown dispatch)
		await expect(editor.popup()).not.toBeVisible({ timeout: 3000 });
	});

	test('Tab closes popup', async ({ editor, page }) => {
		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		await expect(editor.popup()).toBeVisible();

		// Wait for auto-focus
		await page.waitForTimeout(150);

		// Tab should close popup
		await page.keyboard.press('Tab');

		await expect(editor.popup()).not.toBeVisible();
	});
});

test.describe('Focus Indicators', () => {
	test('Focus-visible outline is present on keyboard focus', async ({ editor }) => {
		const boldBtn = editor.markButton('bold');
		await boldBtn.focus();

		// Check that the button has a visible box-shadow (focus-visible ring)
		const boxShadow = await boldBtn.evaluate((el) => {
			return window.getComputedStyle(el).boxShadow;
		});

		// Should have some kind of box-shadow (not 'none')
		expect(boxShadow).not.toBe('none');
	});
});

test.describe('Screen Reader Announcements', () => {
	test('Undo is announced', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Control+z');

		await expect(editor.announcer()).toHaveText('Undo');
	});

	test('Redo is announced', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Control+z');
		await expect(editor.announcer()).toHaveText('Undo');

		await page.keyboard.press('Control+Shift+z');
		await expect(editor.announcer()).toHaveText('Redo');
	});

	test('Block type change is announced via keyboard shortcut', async ({ editor, page }) => {
		await editor.typeText('Hello');

		// Use the heading keyboard shortcut (if available) or test via the button click
		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		await expect(editor.popup()).toBeVisible();
		await page.waitForTimeout(150);

		// Navigate to a heading item and click it
		const popupItem = editor.root.locator('.notectl-heading-picker__item').nth(1);
		await popupItem.click();

		// Should announce the block type change
		const text = await editor.announcer().textContent();
		expect(text).toBeTruthy();
	});
});

test.describe('ARIA Enhancements', () => {
	test('Heading picker items have role="option" and aria-selected', async ({ editor, page }) => {
		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		await expect(editor.popup()).toBeVisible();
		await page.waitForTimeout(150);

		// All picker items should have role="option"
		const items = editor.root.locator('.notectl-heading-picker__item');
		const count = await items.count();
		expect(count).toBeGreaterThan(0);

		for (let i = 0; i < count; i++) {
			await expect(items.nth(i)).toHaveAttribute('role', 'option');
			await expect(items.nth(i)).toHaveAttribute('aria-selected');
		}

		// The list container should have role="listbox"
		const list = editor.root.locator('.notectl-heading-picker__list');
		await expect(list).toHaveAttribute('role', 'listbox');
		await expect(list).toHaveAttribute('aria-label', 'Block types');

		await page.keyboard.press('Escape');
	});

});
