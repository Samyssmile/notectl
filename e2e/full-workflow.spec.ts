import { expect, test } from './fixtures/editor-page';

test.describe('Full Workflow — Rich Document Creation', () => {
	test('create a structured document with heading, paragraphs, and list', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		// 1. Heading via input rule
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Meeting Notes', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter at end of heading automatically creates a paragraph

		// 2. Normal paragraph
		await page.keyboard.type('Discussed the following topics:', { delay: 10 });
		await page.keyboard.press('Enter');

		// 3. Bullet list via input rule
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Project timeline', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Budget review', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Team assignments', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // Exit list

		// 4. Blockquote via input rule
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('Action: Review by Friday', { delay: 10 });

		// Verify document structure
		const json = await editor.getJSON();

		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(1);
		expect(json.children[1]?.type).toBe('paragraph');
		expect(json.children[2]?.type).toBe('list_item');
		expect(json.children[2]?.attrs?.listType).toBe('bullet');

		const types = json.children.map((c: { type: string }) => c.type);
		expect(types).toContain('blockquote');

		// Verify all text is present
		const text = await editor.getText();
		expect(text).toContain('Meeting Notes');
		expect(text).toContain('Discussed the following topics:');
		expect(text).toContain('Project timeline');
		expect(text).toContain('Budget review');
		expect(text).toContain('Team assignments');
		expect(text).toContain('Action: Review by Friday');
	});

	test('apply multiple formatting marks, then undo step by step', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		let html = await editor.getHTML();
		expect(html).toContain('<strong>');

		await page.keyboard.press('Control+i');
		html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');

		await page.keyboard.press('Control+u');
		html = await editor.getHTML();
		expect(html).toContain('<u>');

		// Undo underline
		await page.keyboard.press('Control+z');
		html = await editor.getHTML();
		expect(html).not.toContain('<u>');

		// Undo italic
		await page.keyboard.press('Control+z');
		html = await editor.getHTML();
		expect(html).not.toContain('<em>');

		// Undo bold
		await page.keyboard.press('Control+z');
		html = await editor.getHTML();
		expect(html).not.toContain('<strong>');

		const text = await editor.getText();
		expect(text.trim()).toBe('Hello World');
	});

	test('create heading, change alignment, apply formatting — verify via DOM', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Centered Bold Title');
		await page.keyboard.press('Control+Shift+2');
		await page.keyboard.press('Control+Shift+e');

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(2);

		const html = await editor.getHTML();
		expect(html).toContain('<h2');
		expect(html).toContain('<strong>');

		const align = await page.evaluate(() => {
			const el = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('[data-block-id]') as HTMLElement | undefined;
			return el?.style.textAlign;
		});
		expect(align).toBe('center');
	});

	test('build a checklist, then convert first item to bullet list', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('[ ] ', { delay: 10 });
		await page.keyboard.type('Buy milk', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Do laundry', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Clean kitchen', { delay: 10 });

		let json = await editor.getJSON();
		expect(json.children.length).toBe(3);
		expect(json.children[0]?.attrs?.listType).toBe('checklist');

		// Move to first item and convert it to bullet
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(100);
		await editor.markButton('list-bullet').click();

		json = await editor.getJSON();
		expect(json.children[0]?.attrs?.listType).toBe('bullet');

		// Text is preserved
		const text = await editor.getText();
		expect(text).toContain('Buy milk');
		expect(text).toContain('Do laundry');
		expect(text).toContain('Clean kitchen');
	});

	test('horizontal rule between sections', async ({ editor, page }) => {
		await editor.focus();

		// Section 1
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Section One', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter at end of heading already creates a paragraph
		await page.keyboard.type('First paragraph content.', { delay: 10 });
		await page.keyboard.press('Enter');

		// Insert horizontal rule via input rule
		await page.keyboard.type('--- ', { delay: 10 });

		// Section 2 heading via shortcut (cursor is on paragraph after HR)
		await page.keyboard.type('Section Two', { delay: 10 });
		await page.keyboard.press('Control+Shift+1');

		const json = await editor.getJSON();
		const types = json.children.map((c: { type: string }) => c.type);

		expect(types).toContain('heading');
		expect(types).toContain('paragraph');
		expect(types).toContain('horizontal_rule');

		const hrIndex = types.indexOf('horizontal_rule');
		expect(hrIndex).toBeGreaterThan(0);
		expect(hrIndex).toBeLessThan(types.length - 1);
	});

	test('strikethrough + bold combined in list item, then undo all', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Completed task', { delay: 10 });

		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+Shift+x');

		let html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<s>');

		await page.keyboard.press('Control+z');
		html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).not.toContain('<s>');

		await page.keyboard.press('Control+z');
		html = await editor.getHTML();
		expect(html).not.toContain('<strong>');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		const text = await editor.getText();
		expect(text.trim()).toBe('Completed task');
	});

	test('JSON roundtrip preserves full document structure', async ({ editor, page }) => {
		await editor.focus();

		// Heading
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Title', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter at end of heading already creates a paragraph

		// Paragraph
		await page.keyboard.type('Normal text here.', { delay: 10 });
		await page.keyboard.press('Enter');

		// List
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item A', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Item B', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // Exit list

		// Blockquote
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('Important note', { delay: 10 });

		const originalJSON = await editor.getJSON();
		const originalText = await editor.getText();

		const types = originalJSON.children.map((c: { type: string }) => c.type);
		expect(types).toContain('heading');
		expect(types).toContain('paragraph');
		expect(types).toContain('list_item');
		expect(types).toContain('blockquote');

		// Restore via setJSON
		await editor.setJSON(originalJSON);

		const restoredJSON = await editor.getJSON();
		expect(restoredJSON.children.length).toBe(originalJSON.children.length);

		for (let i = 0; i < originalJSON.children.length; i++) {
			expect(restoredJSON.children[i]?.type).toBe(originalJSON.children[i]?.type);
		}

		const restoredText = await editor.getText();
		expect(restoredText).toBe(originalText);
	});

	test('document with all block types created via input rules', async ({ editor, page }) => {
		await editor.focus();

		// Heading
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Title', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter at end of heading already creates a paragraph

		// Paragraph with bold
		await page.keyboard.type('Normal ', { delay: 10 });
		await page.keyboard.press('Control+b');
		await page.keyboard.type('bold', { delay: 10 });
		await page.keyboard.press('Control+b');
		await page.keyboard.type(' text', { delay: 10 });
		await page.keyboard.press('Enter');

		// Blockquote
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('A quote', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter on blockquote creates new blockquote; toggle back to paragraph
		await editor.markButton('blockquote').click();

		// Bullet list
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[1]?.type).toBe('paragraph');
		expect(json.children[2]?.type).toBe('blockquote');

		const types = json.children.map((c: { type: string }) => c.type);
		expect(types).toContain('list_item');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<h1');

		const text = await editor.getText();
		expect(text).toContain('Title');
		expect(text).toContain('A quote');
		expect(text).toContain('Item');
	});

	test('complex editing: merge blocks, reformat, then undo', async ({ editor, page }) => {
		await editor.typeText('First paragraph');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second paragraph', { delay: 10 });

		// Merge blocks
		await page.keyboard.press('Home');
		await page.keyboard.press('Backspace');

		let json = await editor.getJSON();
		expect(json.children.length).toBe(1);

		// Convert to heading + format
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+Shift+1');
		await page.keyboard.press('Control+b');

		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');

		// Undo bold → heading stays but bold removed
		await page.keyboard.press('Control+z');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		const html2: string = await editor.getHTML();
		expect(html2).not.toContain('<strong>');

		// Undo heading → paragraph
		await page.keyboard.press('Control+z');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');

		// Keep undoing until we get back to 2 blocks (merge undo)
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('Control+z');
			json = await editor.getJSON();
			if (json.children.length === 2) break;
		}
		expect(json.children.length).toBe(2);
		const text = await editor.getText();
		expect(text).toContain('First paragraph');
		expect(text).toContain('Second paragraph');
	});

	test('text alignment preserved when changing block type', async ({ editor, page }) => {
		await editor.typeText('Center me');
		await page.keyboard.press('Control+Shift+e');

		let json = await editor.getJSON();
		expect(json.children[0]?.attrs?.align).toBe('center');

		// Convert to heading — alignment should persist
		await page.keyboard.press('Control+Shift+1');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.align).toBe('center');

		// Convert back to paragraph
		await page.keyboard.press('Control+Shift+1');
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
		expect(json.children[0]?.attrs?.align).toBe('center');
	});

	test('full document with every block type', async ({ editor, page }) => {
		await editor.focus();

		// Heading
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Document Title', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter at end of heading already creates a paragraph

		// Paragraph
		await page.keyboard.type('Introduction paragraph.', { delay: 10 });
		await page.keyboard.press('Enter');

		// Horizontal rule
		await page.keyboard.type('--- ', { delay: 10 });

		// Blockquote
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('An important quote.', { delay: 10 });
		await page.keyboard.press('Enter');
		// Enter on blockquote creates new blockquote; toggle back to paragraph
		await editor.markButton('blockquote').click();

		// Ordered list
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('Step one', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Step two', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // Exit list

		// Checklist
		await page.keyboard.type('[ ] ', { delay: 10 });
		await page.keyboard.type('Todo item', { delay: 10 });

		const json = await editor.getJSON();
		const types = json.children.map((c: { type: string }) => c.type);
		expect(types).toContain('heading');
		expect(types).toContain('paragraph');
		expect(types).toContain('horizontal_rule');
		expect(types).toContain('blockquote');
		expect(types).toContain('list_item');

		const listItems = json.children.filter((c: { type: string }) => c.type === 'list_item');
		const listTypes = listItems.map((c: { attrs?: { listType?: string } }) => c.attrs?.listType);
		expect(listTypes).toContain('ordered');
		expect(listTypes).toContain('checklist');

		const text = await editor.getText();
		expect(text).toContain('Document Title');
		expect(text).toContain('Introduction paragraph.');
		expect(text).toContain('An important quote.');
		expect(text).toContain('Step one');
		expect(text).toContain('Todo item');
	});
});
