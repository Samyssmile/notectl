import { expect, test } from './fixtures/editor-page';

/**
 * Container list items (#194): a `list_item` may hold several block children
 * (second paragraph, code block, blockquote). These journeys cover the
 * markdown round-trip, keyboard editing inside an item, the Enter-Enter exit,
 * the Backspace lift, and structural undo.
 */

/** Calls the editor's async `setContentMarkdown()` in the page. */
async function setMarkdown(page: import('@playwright/test').Page, md: string): Promise<void> {
	await page.evaluate(async (markdown) => {
		const el = document.querySelector('notectl-editor') as HTMLElement & {
			setContentMarkdown(markdown: string): Promise<void>;
		};
		await el.setContentMarkdown(markdown);
	}, md);
}

/** Calls the editor's async `getContentMarkdown()` in the page. */
async function getMarkdown(page: import('@playwright/test').Page): Promise<string> {
	return page.evaluate(async () => {
		const el = document.querySelector('notectl-editor') as HTMLElement & {
			getContentMarkdown(): Promise<string>;
		};
		return el.getContentMarkdown();
	});
}

test.describe('Container list items (#194)', () => {
	test('markdown with a multi-block item renders block children inside one <li>', async ({
		editor,
		page,
	}) => {
		await setMarkdown(page, '- first paragraph\n\n  second paragraph\n- plain item');

		const li = page.locator('notectl-editor li[data-block-type="list_item"]').first();
		await expect(li.locator('p')).toHaveCount(2);
		await expect(li.locator('p').nth(0)).toHaveText('first paragraph');
		await expect(li.locator('p').nth(1)).toHaveText('second paragraph');

		// Both items share one <ul> wrapper.
		await expect(page.locator('notectl-editor ul[data-block-wrapper] > li')).toHaveCount(2);

		const json = await editor.getJSON();
		expect(json.children).toHaveLength(2);
		expect(json.children[0]?.type).toBe('list_item');

		// The markdown export round-trips the structure.
		const md = await getMarkdown(page);
		expect(md).toBe('- first paragraph\n\n  second paragraph\n- plain item\n');
	});

	test('Enter inside a child paragraph splits within the item', async ({ editor, page }) => {
		await setMarkdown(page, '- first\n\n  second');

		// Place the caret at the end of the second child paragraph.
		const second = page.locator('notectl-editor li p', { hasText: 'second' });
		await second.click();
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.type('third', { delay: 10 });

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children).toHaveLength(1);
			const item = json.children[0] as { children: { type: string }[] };
			expect(item.children).toHaveLength(3);
		}).toPass({ timeout: 5_000 });

		await expect(page.locator('notectl-editor li p')).toHaveCount(3);
	});

	test('Enter on an empty trailing child exits into a new list item', async ({ editor, page }) => {
		await setMarkdown(page, '- first\n\n  second');

		const second = page.locator('notectl-editor li p', { hasText: 'second' });
		await second.click();
		await page.keyboard.press('End');
		await page.keyboard.press('Enter'); // creates an empty third child
		await page.keyboard.press('Enter'); // exits into a fresh sibling item
		await page.keyboard.type('next item', { delay: 10 });

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children).toHaveLength(2);
			const container = json.children[0] as { children: { type: string }[] };
			expect(container.children).toHaveLength(2);
			const fresh = json.children[1] as { type: string; attrs?: Record<string, unknown> };
			expect(fresh.type).toBe('list_item');
			expect(fresh.attrs?.listType).toBe('bullet');
		}).toPass({ timeout: 5_000 });

		const md = await getMarkdown(page);
		expect(md).toBe('- first\n\n  second\n- next item\n');
	});

	test('Backspace at the start of the first child un-lists the item', async ({ editor, page }) => {
		await setMarkdown(page, '- first\n\n  second\n- other');

		const first = page.locator('notectl-editor li p', { hasText: 'first' });
		await first.click();
		await page.keyboard.press('Home');
		await page.keyboard.press('Backspace');

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children.map((b: { type: string }) => b.type)).toEqual([
				'paragraph',
				'paragraph',
				'list_item',
			]);
		}).toPass({ timeout: 5_000 });
	});

	test('undo restores a dissolved container item (structural undo)', async ({ editor, page }) => {
		await setMarkdown(page, '- first\n\n  second');

		const first = page.locator('notectl-editor li p', { hasText: 'first' });
		await first.click();
		await page.keyboard.press('Home');
		await page.keyboard.press('Backspace');

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children.map((b: { type: string }) => b.type)).toEqual([
				'paragraph',
				'paragraph',
			]);
		}).toPass({ timeout: 5_000 });

		await page.keyboard.press('Control+z');

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children).toHaveLength(1);
			expect(json.children[0]?.type).toBe('list_item');
			const item = json.children[0] as { children: { type: string }[] };
			expect(item.children).toHaveLength(2);
		}).toPass({ timeout: 5_000 });
	});

	test('checklist container keeps its checkbox and toggles via Mod-Enter from a child', async ({
		editor,
		page,
	}) => {
		await setMarkdown(page, '- [ ] task\n\n  details');

		const marker = page.locator('notectl-editor .notectl-checklist-marker');
		await expect(marker).toHaveAttribute('aria-checked', 'false');

		const details = page.locator('notectl-editor li p', { hasText: 'details' });
		await details.click();
		await page.keyboard.press('Control+Enter');

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.attrs?.checked).toBe(true);
		}).toPass({ timeout: 5_000 });

		const md = await getMarkdown(page);
		expect(md).toBe('- [x] task\n\n  details\n');
	});
});
