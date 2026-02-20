import { expect, test } from './fixtures/editor-page';

test.describe('Accessibility', () => {
	test('Content area has correct ARIA attributes', async ({ editor }) => {
		await expect(editor.content).toHaveAttribute('role', 'textbox');
		await expect(editor.content).toHaveAttribute('aria-multiline', 'true');
		await expect(editor.content).toHaveAttribute('aria-label', 'Rich text editor');
	});

	test('Toolbar has role="toolbar"', async ({ editor }) => {
		await expect(editor.toolbar()).toBeVisible();
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

	test('Escape key exits the editor (WCAG 2.1.2)', async ({ editor, page }) => {
		await editor.focus();

		// Verify editor content area is focused
		const hasFocusBefore = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return false;
			return sr.activeElement?.classList.contains('notectl-content') ?? false;
		});
		expect(hasFocusBefore).toBe(true);

		// Press Escape
		await page.keyboard.press('Escape');

		// Verify focus has left the editor content
		const hasFocusAfter = await editor.root.evaluate((el) => {
			const sr = el.shadowRoot;
			if (!sr) return false;
			return sr.activeElement?.classList.contains('notectl-content') ?? false;
		});
		expect(hasFocusAfter).toBe(false);
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
		const buttons = toolbar.locator('button');
		const count = await buttons.count();
		expect(count).toBeGreaterThan(1);

		// Exactly one button should have tabindex="0"
		const tabindex0 = toolbar.locator('button[tabindex="0"]');
		await expect(tabindex0).toHaveCount(1);

		// All others should have tabindex="-1"
		const tabindexMinus1 = toolbar.locator('button[tabindex="-1"]');
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
		const buttons = toolbar.locator('button');
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
		// The heading plugin button should have aria-haspopup
		const headingBtn = editor.markButton('heading');
		await expect(headingBtn).toHaveAttribute('aria-haspopup', 'true');
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

	test('Link popup input has aria-label', async ({ editor, page }) => {
		// Type text and select it so the link button is enabled
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');

		const linkBtn = editor.markButton('link');
		await linkBtn.click();

		await expect(editor.popup()).toBeVisible();
		await page.waitForTimeout(150);

		const input = editor.root.locator('.notectl-toolbar-popup input[type="url"]');
		await expect(input).toHaveAttribute('aria-label', 'URL');

		const applyBtn = editor.root.locator('.notectl-toolbar-popup button[aria-label="Apply link"]');
		await expect(applyBtn).toBeVisible();

		await page.keyboard.press('Escape');
	});

	test('Bullet list items use semantic <li> inside <ul>', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item', { delay: 10 });

		const wrapper = editor.root.locator('ul[role="list"]');
		await expect(wrapper).toBeVisible();

		const listItem = wrapper.locator('li[role="listitem"]');
		await expect(listItem).toBeVisible();
		await expect(listItem).toHaveAttribute('aria-level', '1');
	});

	test('Ordered list items use semantic <li> inside <ol>', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('First', { delay: 10 });

		const wrapper = editor.root.locator('ol[role="list"]');
		await expect(wrapper).toBeVisible();

		const listItem = wrapper.locator('li[role="listitem"]');
		await expect(listItem).toBeVisible();
		await expect(listItem).toHaveAttribute('aria-level', '1');
	});

	test('Checklist items use semantic <li> with aria-checked', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('[ ] ', { delay: 10 });
		await page.keyboard.type('Task', { delay: 10 });

		const wrapper = editor.root.locator('ul[role="list"]');
		await expect(wrapper).toBeVisible();

		const listItem = wrapper.locator('li[role="listitem"]');
		await expect(listItem).toBeVisible();
		await expect(listItem).toHaveAttribute('aria-checked', 'false');
	});

	test('Switching list type changes wrapper element', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item', { delay: 10 });

		// Should start as <ul>
		await expect(editor.root.locator('ul[role="list"]')).toBeVisible();
		await expect(editor.root.locator('ol[role="list"]')).not.toBeVisible();

		// Switch to ordered list
		const orderedBtn = editor.markButton('list-ordered');
		await orderedBtn.click();

		// Should now be <ol>
		await expect(editor.root.locator('ol[role="list"]')).toBeVisible();
		await expect(editor.root.locator('ul[role="list"]')).not.toBeVisible();
	});

	test('Multiple consecutive list items share a single wrapper', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('First', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });

		const wrapper = editor.root.locator('ul[role="list"]');
		await expect(wrapper).toBeVisible();

		const items = wrapper.locator('li[role="listitem"]');
		await expect(items).toHaveCount(2);
	});

	test('Paragraph between lists creates separate wrappers', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item', { delay: 10 });
		// Enter on non-empty → new list item; Enter on empty → exit to paragraph
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		// Type text so the paragraph persists (not converted back to list by input rule)
		await page.keyboard.type('Break', { delay: 10 });
		await page.keyboard.press('Enter');
		// Now on a new paragraph — type another list
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Another', { delay: 10 });

		const wrappers = editor.root.locator('ul[role="list"]');
		await expect(wrappers).toHaveCount(2);
	});
});
