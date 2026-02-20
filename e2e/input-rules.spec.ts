import { expect, test } from './fixtures/editor-page';

test.describe('Input Rules — Markdown Shortcuts', () => {
	// ── Heading input rules ─────────────────────────────────────

	test('# + space creates heading level 1', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('# ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(1);
	});

	test('## + space creates heading level 2', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('## ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(2);
	});

	test('### + space creates heading level 3', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('### ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(3);
	});

	test('#### through ###### create heading levels 4–6', async ({ editor, page }) => {
		await editor.focus();

		for (let level = 4; level <= 6; level++) {
			const hashes = '#'.repeat(level);
			await page.keyboard.type(`${hashes} `, { delay: 10 });

			const json = await editor.getJSON();
			const lastBlock = json.children[json.children.length - 1];
			expect(lastBlock?.type).toBe('heading');
			expect(lastBlock?.attrs?.level).toBe(level);

			// Enter at end of heading creates a new paragraph automatically
			await page.keyboard.press('Enter');
		}
	});

	test('heading input rule removes the # prefix text', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('My Heading', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('My Heading');
		expect(text).not.toContain('#');
	});

	test('####### (7 hashes) does NOT create a heading', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('####### ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	// ── Blockquote input rule ───────────────────────────────────

	test('> + space creates blockquote', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('> ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('blockquote');
	});

	test('blockquote input rule removes the > prefix', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('A famous quote', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('A famous quote');
		expect(text).not.toContain('>');
	});

	test('blockquote renders correct DOM element', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('Quote text', { delay: 10 });

		// Verify via JSON (getHTML() doesn't serialize blockquote)
		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('blockquote');

		// Verify DOM rendering
		const blockquote = editor.content.locator('blockquote');
		await expect(blockquote).toBeVisible();
		await expect(blockquote).toContainText('Quote text');
	});

	// ── Bullet list input rules ─────────────────────────────────

	test('- + space creates bullet list', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('bullet');
	});

	test('* + space creates bullet list', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('* ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('bullet');
	});

	test('bullet list input rule removes the - prefix', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('List item', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('List item');
	});

	// ── Ordered list input rule ─────────────────────────────────

	test('1. + space creates ordered list', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('1. ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('ordered');
	});

	test('ordered list input rule works with other numbers', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('5. ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('ordered');
	});

	test('ordered list input rule removes the number prefix', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('First item', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('First item');
	});

	// ── Checklist input rules ───────────────────────────────────

	test('[ ] + space creates unchecked checklist', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('[ ] ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('checklist');
		expect(json.children[0]?.attrs?.checked).toBe(false);
	});

	test('[x] + space creates checked checklist', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('[x] ', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('checklist');
		expect(json.children[0]?.attrs?.checked).toBe(true);
	});

	test('checklist input rule removes the [ ] prefix', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('[ ] ', { delay: 10 });
		await page.keyboard.type('Buy groceries', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('Buy groceries');
	});

	// ── Horizontal rule input rule ──────────────────────────────

	test('--- + space creates horizontal rule', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('--- ', { delay: 10 });

		const json = await editor.getJSON();
		const types = json.children.map((c: { type: string }) => c.type);
		expect(types).toContain('horizontal_rule');
	});

	test('---- (4 dashes) + space also creates HR', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('---- ', { delay: 10 });

		const json = await editor.getJSON();
		const types = json.children.map((c: { type: string }) => c.type);
		expect(types).toContain('horizontal_rule');
	});

	test('HR input rule adds empty paragraph after', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('--- ', { delay: 10 });

		const json = await editor.getJSON();
		const lastBlock = json.children[json.children.length - 1];
		expect(lastBlock?.type).toBe('paragraph');
	});

	// ── Input rules only trigger on paragraph blocks ────────────

	test('# in the middle of text does NOT convert to heading', async ({ editor, page }) => {
		await editor.typeText('Hello # World');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	test('- in the middle of text does NOT convert to list', async ({ editor, page }) => {
		await editor.typeText('Hello - World');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	// ── Input rules interact with undo ──────────────────────────

	test('undo after heading input rule reverts to paragraph with # text', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await page.keyboard.type('# ', { delay: 10 });

		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');

		await page.keyboard.press('Control+z');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	test('undo after bullet list input rule reverts to paragraph', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });

		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');

		await page.keyboard.press('Control+z');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	// ── Sequential input rules create multiple blocks ───────────

	test('multiple headings via input rules', async ({ editor, page }) => {
		await editor.focus();

		// Heading 1
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Title', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter at end of heading already creates a paragraph

		// Heading 2
		await page.keyboard.type('## ', { delay: 10 });
		await page.keyboard.type('Subtitle', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter at end of heading already creates a paragraph

		// Heading 3
		await page.keyboard.type('### ', { delay: 10 });
		await page.keyboard.type('Section', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(3);
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(1);
		expect(json.children[1]?.type).toBe('heading');
		expect(json.children[1]?.attrs?.level).toBe(2);
		expect(json.children[2]?.type).toBe('heading');
		expect(json.children[2]?.attrs?.level).toBe(3);
	});

	test('mixed block types via input rules', async ({ editor, page }) => {
		await editor.focus();

		// Heading
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Heading', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter at end of heading already creates a paragraph

		// Blockquote
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('Quote', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter on blockquote creates new blockquote; toggle back to paragraph
		await editor.markButton('blockquote').click();

		// Bullet list
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('List item', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // Exit list

		await page.keyboard.type('Normal paragraph', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[1]?.type).toBe('blockquote');

		// After blockquote, list item should exist
		const types = json.children.map((c: { type: string }) => c.type);
		expect(types).toContain('list_item');

		const lastBlock = json.children[json.children.length - 1];
		expect(lastBlock?.type).toBe('paragraph');
	});
});
