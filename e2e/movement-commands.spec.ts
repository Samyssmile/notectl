import { expect, test } from './fixtures/editor-page';

test.describe('Movement Commands', () => {
	test.describe('Word movement', () => {
		test('Ctrl+ArrowRight moves cursor by word forward', async ({ editor, page }) => {
			await editor.typeText('hello world');
			await page.waitForTimeout(100);
			// Move to start first
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			// Move one word forward (browser lands after "hello")
			await page.keyboard.press('Control+ArrowRight');
			await page.waitForTimeout(50);
			// Type at new position
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			// Cursor lands after "hello" (browser word boundary)
			expect(text.trim()).toBe('helloX world');
		});

		test('Ctrl+ArrowLeft moves cursor by word backward', async ({ editor, page }) => {
			await editor.typeText('hello world');
			await page.waitForTimeout(100);
			// Move one word backward from end
			await page.keyboard.press('Control+ArrowLeft');
			await page.waitForTimeout(50);
			// Type at new position (before "world")
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('Xworld');
		});
	});

	test.describe('Line boundary', () => {
		test('Home moves cursor to start of line', async ({ editor, page }) => {
			await editor.typeText('hello world');
			await page.waitForTimeout(100);
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toMatch(/^Xhello/);
		});

		test('End moves cursor to end of line', async ({ editor, page }) => {
			await editor.typeText('hello world');
			await page.waitForTimeout(100);
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			await page.keyboard.press('End');
			await page.waitForTimeout(50);
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toMatch(/worldX$/);
		});
	});

	test.describe('Document boundary', () => {
		test('Ctrl+Home moves to start of document', async ({ editor, page }) => {
			await editor.typeText('First line');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Second line', { delay: 10 });
			await page.waitForTimeout(100);
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);
			await page.keyboard.type('X', { delay: 10 });

			const json = await editor.getJSON();
			const firstBlock = json.children[0];
			const firstText: string =
				firstBlock?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(firstText).toMatch(/^X/);
		});

		test('Ctrl+End moves to end of document', async ({ editor, page }) => {
			await editor.typeText('First line');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Second line', { delay: 10 });
			await page.waitForTimeout(100);
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);
			await page.keyboard.press('Control+End');
			await page.waitForTimeout(50);
			await page.keyboard.type('X', { delay: 10 });

			const json = await editor.getJSON();
			const lastBlock = json.children[json.children.length - 1];
			const lastText: string =
				lastBlock?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(lastText).toMatch(/X$/);
		});

		test('Ctrl+Home when first block is void selects it', async ({ editor, page }) => {
			await editor.setContentHTML('<hr><p>After</p>');
			await page.waitForTimeout(200);

			// Focus the text block
			const paragraph = page.locator('notectl-editor p').first();
			await paragraph.click();
			await editor.content.focus();
			await page.waitForTimeout(100);

			// Ctrl+Home → should select the HR (NodeSelection)
			await page.keyboard.press('Control+Home');
			await page.waitForFunction(() => {
				const el = document.querySelector('notectl-editor') as
					| (HTMLElement & { getState?: () => { selection?: { type?: string; nodeId?: string } } })
					| null;
				const sel = el?.getState?.().selection;
				return sel?.type === 'node' && typeof sel.nodeId === 'string';
			});

			// Delete should remove the HR (proves NodeSelection was set)
			const hr = page.locator('notectl-editor hr');
			await page.keyboard.press('Delete');
			await page.waitForTimeout(200);
			await expect(hr).toBeHidden({ timeout: 2000 });

			const text: string = await editor.getText();
			expect(text).toContain('After');
		});

		test('Ctrl+End when last block is void selects it', async ({ editor, page }) => {
			await editor.setContentHTML('<p>Before</p><hr>');
			await page.waitForTimeout(200);

			// Focus the text block
			const paragraph = page.locator('notectl-editor p').first();
			await paragraph.click();
			await editor.content.focus();
			await page.waitForTimeout(100);

			// Ctrl+End → should select the HR (NodeSelection)
			await page.keyboard.press('Control+End');
			await page.waitForFunction(() => {
				const el = document.querySelector('notectl-editor') as
					| (HTMLElement & { getState?: () => { selection?: { type?: string; nodeId?: string } } })
					| null;
				const sel = el?.getState?.().selection;
				return sel?.type === 'node' && typeof sel.nodeId === 'string';
			});

			// Backspace should remove the HR (proves NodeSelection was set)
			const hr = page.locator('notectl-editor hr');
			await page.keyboard.press('Backspace');
			await page.waitForTimeout(200);
			await expect(hr).toBeHidden({ timeout: 2000 });

			const text: string = await editor.getText();
			expect(text).toContain('Before');
		});
	});

	test.describe('Selection extension', () => {
		test('Shift+ArrowRight creates and extends selection', async ({ editor, page }) => {
			await editor.typeText('ABCDE');
			await page.waitForTimeout(100);
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			// Extend selection 3 characters right
			await page.keyboard.press('Shift+ArrowRight');
			await page.keyboard.press('Shift+ArrowRight');
			await page.keyboard.press('Shift+ArrowRight');
			await page.waitForTimeout(50);
			// Delete the selected text
			await page.keyboard.press('Backspace');
			const text: string = await editor.getText();
			expect(text.trim()).toBe('DE');
		});

		test('Shift+ArrowLeft extends selection backward', async ({ editor, page }) => {
			await editor.typeText('ABCDE');
			await page.waitForTimeout(100);
			// Extend selection 2 characters left from end
			await page.keyboard.press('Shift+ArrowLeft');
			await page.keyboard.press('Shift+ArrowLeft');
			await page.waitForTimeout(50);
			await page.keyboard.press('Backspace');
			const text: string = await editor.getText();
			expect(text.trim()).toBe('ABC');
		});

		test('Shift+Home extends selection to start of line', async ({ editor, page }) => {
			await editor.typeText('ABCDE');
			await page.waitForTimeout(100);
			await page.keyboard.press('Shift+Home');
			await page.waitForTimeout(50);
			await page.keyboard.press('Backspace');
			const text: string = await editor.getText();
			expect(text.trim()).toBe('');
		});

		test('Shift+End extends selection to end of line', async ({ editor, page }) => {
			await editor.typeText('ABCDE');
			await page.waitForTimeout(100);
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			await page.keyboard.press('Shift+End');
			await page.waitForTimeout(50);
			await page.keyboard.press('Backspace');
			const text: string = await editor.getText();
			expect(text.trim()).toBe('');
		});

		test('Shift+Ctrl+ArrowRight extends by word', async ({ editor, page }) => {
			await editor.typeText('hello world');
			await page.waitForTimeout(100);
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			await page.keyboard.press('Shift+Control+ArrowRight');
			await page.waitForTimeout(50);
			await page.keyboard.press('Backspace');
			const text: string = await editor.getText();
			// "hello " or "hello" was deleted, remaining is "world"
			expect(text.trim()).toBe('world');
		});
	});

	test.describe('Cross-block word movement', () => {
		test('Ctrl+ArrowRight crosses block boundary', async ({ editor, page }) => {
			await editor.typeText('hello');
			await page.keyboard.press('Enter');
			await page.keyboard.type('world', { delay: 10 });
			await page.waitForTimeout(100);
			// Go to end of first block
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);
			await page.keyboard.press('End');
			await page.waitForTimeout(50);
			// Word-move forward should cross into second block
			await page.keyboard.press('Control+ArrowRight');
			await page.waitForTimeout(50);
			await page.keyboard.type('X', { delay: 10 });

			const json = await editor.getJSON();
			const secondBlock = json.children[1];
			const secondText: string =
				secondBlock?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(secondText).toContain('X');
		});
	});
});
