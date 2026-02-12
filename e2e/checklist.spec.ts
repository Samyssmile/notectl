import { expect, test } from './fixtures/editor-page';

test.describe('Checklist', () => {
	test('clicking checklist toolbar button converts paragraph to checklist', async ({
		editor,
		page,
	}) => {
		await editor.typeText('My task');

		const checklistBtn = editor.markButton('list-checklist');
		await expect(checklistBtn).toBeVisible();
		await checklistBtn.click();

		const json = await editor.getJSON();
		const block = json.children[0];
		expect(block?.type).toBe('list_item');
		expect(block?.attrs?.listType).toBe('checklist');
		expect(block?.attrs?.checked).toBe(false);
	});

	test('checklist item renders a visible checkbox marker', async ({ editor, page }) => {
		await editor.typeText('My task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		const listItem = editor.content.locator('.notectl-list-item--checklist');
		await expect(listItem).toBeVisible();
		await expect(listItem).toHaveAttribute('data-checked', 'false');

		const hasMarkerSpace = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('.notectl-list-item--checklist');
			if (!el) return false;
			const style = getComputedStyle(el, '::before');
			return style.content !== 'none' && style.content !== '';
		});
		expect(hasMarkerSpace).toBe(true);
	});

	test('clicking checklist button again reverts to paragraph', async ({ editor, page }) => {
		await editor.typeText('My task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');

		await checklistBtn.click();
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	test('checklist preserves text content', async ({ editor, page }) => {
		await editor.typeText('Buy groceries');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		const text = await editor.getText();
		expect(text.trim()).toBe('Buy groceries');
	});

	test('placeholder disappears when checklist is toggled on empty editor', async ({
		editor,
		page,
	}) => {
		// Don't type any text — the editor is empty with placeholder visible
		const placeholder = editor.content;
		await expect(placeholder).toHaveClass(/notectl-content--empty/);

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		// Placeholder should disappear because the block is now a list_item, not paragraph
		await expect(placeholder).not.toHaveClass(/notectl-content--empty/);
	});

	test('cursor is to the right of checkbox, not overlapping', async ({ editor, page }) => {
		await editor.typeText('Task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		// The checkbox is rendered via ::before. Text should start after it.
		// Verify the list item has left padding > 0 (space for the marker)
		const paddingLeft = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('.notectl-list-item--checklist');
			if (!el) return 0;
			return Number.parseFloat(getComputedStyle(el).paddingLeft);
		});
		expect(paddingLeft).toBeGreaterThanOrEqual(20);
	});

	test('typing in checklist does not overlap checkbox', async ({ editor, page }) => {
		// Start with empty editor, toggle checklist, then type
		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();
		await page.keyboard.type('New task', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('New task');

		// Verify text is positioned to the right of the marker
		const positions = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('.notectl-list-item--checklist');
			if (!el) return { markerWidth: 0, paddingLeft: 0 };
			const beforeStyle = getComputedStyle(el, '::before');
			const markerWidth = Number.parseFloat(beforeStyle.width) || 0;
			const paddingLeft = Number.parseFloat(getComputedStyle(el).paddingLeft);
			return { markerWidth, paddingLeft };
		});
		// Text area (padding-left) must be wider than the marker to prevent overlap
		expect(positions.paddingLeft).toBeGreaterThanOrEqual(positions.markerWidth);
	});

	test('Enter on checklist item creates new checklist item', async ({ editor, page }) => {
		await editor.typeText('First task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		await page.keyboard.press('Enter');
		await page.keyboard.type('Second task', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('checklist');
		expect(json.children[1]?.type).toBe('list_item');
		expect(json.children[1]?.attrs?.listType).toBe('checklist');
		expect(json.children[1]?.attrs?.checked).toBe(false);
	});

	test('Enter on empty checklist item exits list (converts to paragraph)', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		// Press Enter to create a new empty checklist item, then Enter again to exit
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('checklist');
		// Second block should be a paragraph (exited list)
		expect(json.children[1]?.type).toBe('paragraph');
	});

	test('Backspace at start of list item converts to paragraph', async ({ editor, page }) => {
		// Toggle checklist on empty editor, then press Backspace
		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		const json1 = await editor.getJSON();
		expect(json1.children[0]?.type).toBe('list_item');

		await page.keyboard.press('Backspace');

		const json2 = await editor.getJSON();
		expect(json2.children[0]?.type).toBe('paragraph');
	});

	test('Backspace at start of non-empty list item converts to paragraph keeping text', async ({
		editor,
		page,
	}) => {
		// Toggle checklist on empty editor (cursor is at offset 0)
		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		// Type some text — cursor moves to the right
		await page.keyboard.type('Keep this text', { delay: 10 });

		const json1 = await editor.getJSON();
		expect(json1.children[0]?.type).toBe('list_item');

		// Move cursor back to the very start with Home, wait for selection sync
		await page.keyboard.press('Home');
		await page.waitForTimeout(100);

		// Backspace at offset 0 should convert list_item → paragraph
		await page.keyboard.press('Backspace');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');

		const text = await editor.getText();
		expect(text).toContain('Keep this text');
	});

	test('Backspace removes characters normally in middle of list item', async ({ editor, page }) => {
		await editor.typeText('Hello');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		await page.keyboard.press('Backspace');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		const text = await editor.getText();
		expect(text.trim()).toBe('Hell');
	});

	test('bullet list item renders a visible marker', async ({ editor, page }) => {
		await editor.typeText('item');

		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		const listItem = editor.content.locator('.notectl-list-item--bullet');
		await expect(listItem).toBeVisible();

		const hasMarkerSpace = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('.notectl-list-item--bullet');
			if (!el) return false;
			const style = getComputedStyle(el, '::before');
			return style.content !== 'none' && style.content !== '';
		});
		expect(hasMarkerSpace).toBe(true);
	});

	test('ordered list item renders a number marker', async ({ editor, page }) => {
		await editor.typeText('first');

		const orderedBtn = editor.markButton('list-ordered');
		await orderedBtn.click();

		const listItem = editor.content.locator('.notectl-list-item--ordered');
		await expect(listItem).toBeVisible();

		const hasMarkerSpace = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('.notectl-list-item--ordered');
			if (!el) return false;
			const style = getComputedStyle(el, '::before');
			return style.content !== 'none' && style.content !== '';
		});
		expect(hasMarkerSpace).toBe(true);
	});

	test('Enter on bullet list creates new bullet list item', async ({ editor, page }) => {
		await editor.typeText('First');

		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.attrs?.listType).toBe('bullet');
		expect(json.children[1]?.attrs?.listType).toBe('bullet');
	});
});
