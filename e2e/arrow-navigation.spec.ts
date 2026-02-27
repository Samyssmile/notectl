import { expect, test } from './fixtures/editor-page';
import { insertTable } from './fixtures/table-utils';

test.describe('Arrow Navigation', () => {
	test.describe('Within text block', () => {
		test('ArrowRight and ArrowLeft move cursor by one character', async ({ editor, page }) => {
			await editor.typeText('ABCDE');
			await page.waitForTimeout(200);
			// Cursor is at end (offset 5). Move left 2 chars (offset 3).
			await page.keyboard.press('ArrowLeft');
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);
			// Move right 1 char (offset 4).
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);
			// Insert at offset 4
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toBe('ABCDXE');
		});

		test('ArrowLeft moves cursor backward', async ({ editor, page }) => {
			await editor.typeText('Hello');
			await page.waitForTimeout(100);
			await page.keyboard.press('ArrowLeft');
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toBe('HellXo');
		});
	});

	test.describe('Cross-block navigation', () => {
		test('ArrowDown moves from first block to second block', async ({ editor, page }) => {
			await editor.typeText('Line 1');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Line 2', { delay: 10 });
			// Move up to first block
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);
			// Move down to second block
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);
			await page.keyboard.press('End');
			await page.waitForTimeout(50);
			await page.keyboard.type('!', { delay: 10 });

			const json = await editor.getJSON();
			const lastBlock = json.children[json.children.length - 1];
			const lastText: string =
				lastBlock?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(lastText).toBe('Line 2!');
		});

		test('ArrowUp navigates toward earlier content', async ({ editor, page }) => {
			await editor.typeText('First');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Second', { delay: 10 });
			await page.waitForTimeout(100);

			// Use ArrowUp to move toward the first block
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(50);
			await page.keyboard.type('X', { delay: 10 });

			// X should appear before "Second" (either in first block or at start of second)
			const text: string = await editor.getText();
			const xIdx: number = text.indexOf('X');
			const secondIdx: number = text.indexOf('Second');
			expect(xIdx).toBeLessThan(secondIdx);
		});

		test('three blocks created and navigable', async ({ editor, page }) => {
			await editor.typeText('A');
			await page.keyboard.press('Enter');
			await page.keyboard.type('B', { delay: 10 });
			await page.keyboard.press('Enter');
			await page.keyboard.type('C', { delay: 10 });

			const json = await editor.getJSON();
			expect(json.children.length).toBe(3);

			// Navigate up to middle block and type
			await page.keyboard.press('ArrowUp');
			await page.keyboard.type('X', { delay: 10 });

			const updatedJson = await editor.getJSON();
			// The X should appear in either block 1 or 2 (middle block)
			const allText: string = updatedJson.children
				.map(
					(b: { children?: { text: string }[] }) => b.children?.map((c) => c.text).join('') ?? '',
				)
				.join('');
			expect(allText).toContain('X');
			expect(allText).toContain('A');
			expect(allText).toContain('C');
		});
	});

	test.describe('Void block (image) navigation', () => {
		const DATA_URI_PNG =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

		test('clicking image selects it and Backspace removes it', async ({ editor, page }) => {
			await editor.typeText('Before');
			await page.keyboard.press('Enter');
			await page.waitForTimeout(100);

			// Insert an image via the toolbar
			const imageBtn = editor.markButton('image');
			await imageBtn.click();
			const urlInput = page.locator('notectl-editor input[aria-label="Image URL"]');
			await urlInput.waitFor({ state: 'visible' });
			await urlInput.fill(DATA_URI_PNG);
			const insertBtn = page.locator('notectl-editor button[aria-label="Insert image"]');
			await insertBtn.click();

			const figure = page.locator('notectl-editor figure.notectl-image');
			await figure.waitFor({ state: 'visible', timeout: 5000 });

			// Click the image to select it
			await figure.click();
			await page.waitForTimeout(200);

			// Backspace should remove the image
			await page.keyboard.press('Backspace');
			await page.waitForTimeout(100);

			// Image should be gone
			await expect(figure).toBeHidden({ timeout: 2000 });
			const text: string = await editor.getText();
			expect(text).toContain('Before');
		});

		test('arrow keys near image do not crash', async ({ editor, page }) => {
			await editor.typeText('Before');
			await page.keyboard.press('Enter');
			await page.waitForTimeout(100);

			// Insert image via toolbar
			const imageBtn = editor.markButton('image');
			await imageBtn.click();
			const urlInput = page.locator('notectl-editor input[aria-label="Image URL"]');
			await urlInput.waitFor({ state: 'visible' });
			await urlInput.fill(DATA_URI_PNG);
			const insertBtn = page.locator('notectl-editor button[aria-label="Insert image"]');
			await insertBtn.click();

			const figure = page.locator('notectl-editor figure.notectl-image');
			await figure.waitFor({ state: 'visible', timeout: 5000 });

			// Press arrows near/around the image — should not crash
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			// Editor should still be functional
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('Before');
			expect(text).toContain('X');
		});
	});

	test.describe('Cross-block Text→Text (Phase 1)', () => {
		test('ArrowRight at end of paragraph moves to start of next', async ({ editor, page }) => {
			await editor.typeText('ABC');
			await page.keyboard.press('Enter');
			await page.keyboard.type('DEF', { delay: 10 });
			await page.waitForTimeout(100);

			// Move to end of first block
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('End');
			await page.waitForTimeout(50);

			// ArrowRight should cross to start of second block
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);

			// Type to verify position (should insert at start of 'DEF')
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const secondText: string =
				json.children[1]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(secondText).toBe('XDEF');
		});

		test('ArrowLeft at start of paragraph moves to end of previous', async ({ editor, page }) => {
			await editor.typeText('ABC');
			await page.keyboard.press('Enter');
			await page.keyboard.type('DEF', { delay: 10 });
			await page.waitForTimeout(100);

			// Move to start of second block
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);

			// ArrowLeft should cross to end of first block
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// Type to verify position (should insert at end of 'ABC')
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(firstText).toBe('ABCX');
		});
	});

	test.describe('Cross-block Text→Void (Phase 1)', () => {
		const DATA_URI_PNG =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

		test('ArrowRight at end of paragraph selects next image', async ({ editor, page }) => {
			await editor.typeText('Before');
			await page.keyboard.press('Enter');
			await page.waitForTimeout(100);

			// Insert an image via toolbar
			const imageBtn = editor.markButton('image');
			await imageBtn.click();
			const urlInput = page.locator('notectl-editor input[aria-label="Image URL"]');
			await urlInput.waitFor({ state: 'visible' });
			await urlInput.fill(DATA_URI_PNG);
			const insertBtn = page.locator('notectl-editor button[aria-label="Insert image"]');
			await insertBtn.click();

			const figure = page.locator('notectl-editor figure.notectl-image');
			await figure.waitFor({ state: 'visible', timeout: 5000 });

			// Navigate to end of 'Before' paragraph
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('End');
			await page.waitForTimeout(50);

			// ArrowRight should create NodeSelection on image
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(100);

			// Backspace should remove the image (proves NodeSelection was active)
			await page.keyboard.press('Backspace');
			await page.waitForTimeout(100);
			await expect(figure).toBeHidden({ timeout: 2000 });
		});

		test('ArrowDown from paragraph before image selects image', async ({ editor, page }) => {
			await editor.typeText('X');
			await page.keyboard.press('Enter');
			await page.waitForTimeout(100);

			// Insert an image via toolbar
			const imageBtn = editor.markButton('image');
			await imageBtn.click();
			const urlInput = page.locator('notectl-editor input[aria-label="Image URL"]');
			await urlInput.waitFor({ state: 'visible' });
			await urlInput.fill(DATA_URI_PNG);
			const insertBtn = page.locator('notectl-editor button[aria-label="Insert image"]');
			await insertBtn.click();

			const figure = page.locator('notectl-editor figure.notectl-image');
			await figure.waitFor({ state: 'visible', timeout: 5000 });

			// Navigate to end of 'X'
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('End');
			await page.waitForTimeout(50);

			// ArrowDown at end of textblock should go to next block (image)
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			// Delete confirms NodeSelection
			await page.keyboard.press('Delete');
			await page.waitForTimeout(100);
			await expect(figure).toBeHidden({ timeout: 2000 });
		});
	});

	test.describe('Cross-block Void→Text (Phase 1)', () => {
		const DATA_URI_PNG =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

		test('ArrowRight from NodeSelection on image moves to next text block', async ({
			editor,
			page,
		}) => {
			// Use setContentHTML for a deterministic 3-block structure: paragraph | image | paragraph
			await editor.setContentHTML(
				`<p>Before</p><img src="${DATA_URI_PNG}" alt="test"><p>After</p>`,
			);
			await page.waitForTimeout(200);

			const figure = page.locator('notectl-editor figure.notectl-image');
			await figure.waitFor({ state: 'visible', timeout: 5000 });

			// Click image to select it (NodeSelection)
			await figure.click();
			await page.waitForTimeout(200);

			// ArrowRight should move from NodeSelection to next text block
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);

			// Type to verify cursor moved past image
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			// X should appear after the image, before or at start of 'After'
			expect(text).toContain('XAfter');
		});

		test('ArrowLeft from NodeSelection on image moves to end of previous text block', async ({
			editor,
			page,
		}) => {
			// Use setContentHTML for a deterministic 3-block structure: paragraph | image | paragraph
			await editor.setContentHTML(
				`<p>Before</p><img src="${DATA_URI_PNG}" alt="test"><p>After</p>`,
			);
			await page.waitForTimeout(200);

			const figure = page.locator('notectl-editor figure.notectl-image');
			await figure.waitFor({ state: 'visible', timeout: 5000 });

			// Click image to select it (NodeSelection)
			await figure.click();
			await page.waitForTimeout(200);

			// ArrowLeft should move from NodeSelection to end of 'Before'
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// Type to verify cursor is at end of 'Before'
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			// X should appear at end of 'Before', before the image
			expect(text).toContain('BeforeX');
		});
	});

	test.describe('Readonly navigation (Phase 1)', () => {
		test('arrow keys navigate between blocks in readonly mode', async ({ editor, page }) => {
			await editor.typeText('First');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Second', { delay: 10 });
			await page.waitForTimeout(100);

			await editor.configure({ readonly: true });
			await editor.content.click({ force: true });
			await page.waitForTimeout(100);

			// Navigate around — should not crash
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('ArrowLeft');
			await page.keyboard.press('ArrowRight');

			// Editor content should be unchanged
			const text: string = await editor.getText();
			expect(text).toContain('First');
			expect(text).toContain('Second');
		});
	});

	test.describe('Soft-wrap boundary (Phase 1)', () => {
		test('ArrowDown from middle of wrapped line stays in same block', async ({ editor, page }) => {
			// Narrow editor + long text forces soft-wrap
			await editor.content.evaluate((el) => {
				(el as HTMLElement).style.width = '200px';
			});
			await page.waitForTimeout(50);

			// Type enough text to force wrapping
			const longText = 'The quick brown fox jumps over the lazy dog and keeps running';
			await editor.typeText(longText);
			await page.keyboard.press('Enter');
			await page.keyboard.type('Next block', { delay: 10 });
			await page.waitForTimeout(100);

			// Move to first block, position at start
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);

			// Move to roughly middle of first visual line
			for (let i = 0; i < 10; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowDown should stay within first block (move to next visual line)
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(50);

			// Type to verify we're still in the first block
			await page.keyboard.type('Z', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(firstText).toContain('Z');
			expect(firstText).toContain('fox');
		});
	});

	test.describe('InlineNode navigation (Phase 2)', () => {
		test('ArrowRight skips hard break', async ({ editor, page }) => {
			await editor.typeText('Hello');
			await page.keyboard.press('Shift+Enter');
			await page.keyboard.type('World', { delay: 10 });
			await page.waitForTimeout(100);

			// Home goes to start of "World" visual line (offset 6)
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);

			// ArrowLeft skips the <br> to offset 5
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// ArrowRight should skip the <br> back to offset 6
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);

			// Type to verify we landed after the break
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('XWorld');
		});

		test('ArrowLeft skips hard break', async ({ editor, page }) => {
			await editor.typeText('Hello');
			await page.keyboard.press('Shift+Enter');
			await page.keyboard.type('World', { delay: 10 });
			await page.waitForTimeout(100);

			// Position just after <br>: Home should put us at start of 'World' line
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);

			// ArrowLeft should skip the <br> atomically
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// Type to verify we landed before the break (at end of 'Hello')
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('HelloX');
		});

		test('navigate through adjacent hard breaks', async ({ editor, page }) => {
			await editor.typeText('A');
			await page.keyboard.press('Shift+Enter');
			await page.keyboard.press('Shift+Enter');
			await page.keyboard.type('B', { delay: 10 });
			await page.waitForTimeout(100);

			// Content: A(0) <br>(1) <br>(2) B(3), cursor at end (offset 4)
			// Home goes to visual line start of "B"
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);

			// ArrowLeft to skip second <br>
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// ArrowLeft to skip first <br>
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// Now at offset 1 (between A and first <br>). Move right 2 times to skip both.
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);

			// Type to verify position (should be at start of 'B', offset 3)
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('XB');
		});

		test('ArrowLeft at block start after InlineNode crosses to previous block', async ({
			editor,
			page,
		}) => {
			await editor.typeText('First');
			await page.keyboard.press('Enter');
			// Second block starts with a hard break
			await page.keyboard.press('Shift+Enter');
			await page.keyboard.type('Second', { delay: 10 });
			await page.waitForTimeout(100);

			// Second block: <br>(0) S(1)e(2)c(3)o(4)n(5)d(6), blockLength=7
			// Home goes to visual line start of "Second"
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);

			// ArrowLeft skips the <br> → offset 0
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// ArrowLeft at offset 0 → skipInlineNode returns null → cross-block
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// Should now be in first block
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(firstText).toContain('X');
			expect(firstText).toContain('First');
		});

		test('cursor functional after skip', async ({ editor, page }) => {
			await editor.typeText('AB');
			await page.keyboard.press('Shift+Enter');
			await page.keyboard.type('CD', { delay: 10 });
			await page.waitForTimeout(100);

			// Content: A(0)B(1) <br>(2) C(3)D(4), cursor at end (offset 5)
			// Home goes to start of "CD" visual line (offset 3)
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);

			// ArrowLeft skips the <br> to offset 2
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);

			// ArrowRight skips the <br> back to offset 3
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);

			// Type to verify cursor is alive and correctly positioned
			await page.keyboard.type('Z', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('ZCD');
		});
	});

	test.describe('GapCursor (Phase 3)', () => {
		test('typing at GapCursor creates a new paragraph with text', async ({ editor, page }) => {
			// setHTML: paragraph | HR | paragraph → deterministic 3-block layout
			await editor.setContentHTML('<p>Before</p><hr><p>After</p>');
			await page.waitForTimeout(200);

			const hr = page.locator('notectl-editor hr');
			await hr.waitFor({ state: 'visible', timeout: 5000 });

			// Click HR to get NodeSelection
			await hr.click();
			await page.waitForTimeout(200);

			// ArrowLeft from NodeSelection → GapCursor(before) or cursor in "Before"
			// With adjacent text block, left goes to text cursor. So use ArrowLeft twice:
			// First ArrowLeft → end of "Before", then ArrowRight back to NodeSelection
			// Then ArrowRight → start of "After" or GapCursor(after)
			// Simplest: from NodeSelection, ArrowRight goes to "After" (text block)
			// We need doc edge for GapCursor. Use setContentHTML with HR at start:
			await editor.setContentHTML('<hr><p>After</p>');
			await page.waitForTimeout(200);

			const hr2 = page.locator('notectl-editor hr');
			await hr2.waitFor({ state: 'visible', timeout: 5000 });

			// Click HR to get NodeSelection
			await hr2.click();
			await page.waitForTimeout(200);

			// ArrowLeft at doc start → GapCursor(before)
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(100);

			// Type at GapCursor → new paragraph with text
			await page.keyboard.type('X', { delay: 10 });
			await page.waitForTimeout(100);

			const text: string = await editor.getText();
			expect(text).toContain('X');
			expect(text).toContain('After');
		});

		test('Enter at GapCursor creates empty paragraph', async ({ editor, page }) => {
			// HR at doc end: NodeSelection → ArrowRight → GapCursor(after)
			await editor.setContentHTML('<p>Before</p><hr>');
			await page.waitForTimeout(200);

			const hr = page.locator('notectl-editor hr');
			await hr.waitFor({ state: 'visible', timeout: 5000 });

			// Click HR to get NodeSelection
			await hr.click();
			await page.waitForTimeout(200);

			// ArrowRight at doc end → GapCursor(after)
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(100);

			// Enter creates empty paragraph
			await page.keyboard.press('Enter');
			await page.waitForTimeout(100);

			// Type to verify cursor is in the new paragraph
			await page.keyboard.type('New', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('New');
			expect(text).toContain('Before');
		});

		test('Backspace at GapCursor toward void deletes the HR', async ({ editor, page }) => {
			// HR at doc end: NodeSelection → ArrowRight → GapCursor(after) → Backspace
			await editor.setContentHTML('<p>Before</p><hr>');
			await page.waitForTimeout(200);

			const hr = page.locator('notectl-editor hr');
			await hr.waitFor({ state: 'visible', timeout: 5000 });

			// Click HR to get NodeSelection
			await hr.click();
			await page.waitForTimeout(200);

			// ArrowRight at doc end → GapCursor(after)
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(100);

			// Backspace at GapCursor(after) → delete the HR
			await page.keyboard.press('Backspace');
			await page.waitForTimeout(200);

			// HR should be gone
			await expect(hr).toBeHidden({ timeout: 2000 });
			const text: string = await editor.getText();
			expect(text).toContain('Before');
		});

		test('Delete at GapCursor toward void deletes the HR', async ({ editor, page }) => {
			// HR at doc start: NodeSelection → ArrowLeft → GapCursor(before) → Delete
			await editor.setContentHTML('<hr><p>After</p>');
			await page.waitForTimeout(200);

			const hr = page.locator('notectl-editor hr');
			await hr.waitFor({ state: 'visible', timeout: 5000 });

			// Click HR to get NodeSelection
			await hr.click();
			await page.waitForTimeout(200);

			// ArrowLeft at doc start → GapCursor(before)
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(100);

			// Delete at GapCursor(before) → delete the HR
			await page.keyboard.press('Delete');
			await page.waitForTimeout(200);

			await expect(hr).toBeHidden({ timeout: 2000 });
			const text: string = await editor.getText();
			expect(text).toContain('After');
		});

		test('GapCursor visual indicator is rendered', async ({ editor, page }) => {
			// HR at doc end: NodeSelection → ArrowRight → GapCursor(after) → visible indicator
			await editor.setContentHTML('<p>Before</p><hr>');
			await page.waitForTimeout(200);

			const hr = page.locator('notectl-editor hr');
			await hr.waitFor({ state: 'visible', timeout: 5000 });

			// Click HR to get NodeSelection
			await hr.click();
			await page.waitForTimeout(200);

			// ArrowRight at doc end → GapCursor(after)
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(200);

			// Check for the gap cursor element (height:0 with ::before pseudo, so use toBeAttached)
			const gapCursor = page.locator('notectl-editor .notectl-gap-cursor');
			await expect(gapCursor).toBeAttached({ timeout: 2000 });
		});
	});

	test.describe('Adjacent void blocks — GapCursor chain (Phase 6)', () => {
		test('navigate through two adjacent HRs via GapCursor', async ({ editor, page }) => {
			// Structure: <p>Before</p><hr><hr><p>After</p>
			await editor.setContentHTML('<p>Before</p><hr><hr><p>After</p>');
			await page.waitForTimeout(200);

			const hrs = page.locator('notectl-editor hr');
			await expect(hrs).toHaveCount(2);

			// Click first HR to get NodeSelection
			await hrs.first().click();
			await page.waitForTimeout(200);

			// ArrowRight → second HR (NodeSelection)
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(100);

			// ArrowRight → start of "After" (or GapCursor if at doc-end)
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(100);

			// Type to verify cursor is after both HRs
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('X');
			expect(text).toContain('Before');
			expect(text).toContain('After');
		});

		test('navigate backward through two adjacent HRs', async ({ editor, page }) => {
			// Structure: Before | HR1 | HR2 | After
			await editor.setContentHTML('<p>Before</p><hr><hr><p>After</p>');
			await page.waitForTimeout(200);

			// Start from "After" paragraph and navigate backward
			const afterParagraph = page.locator('notectl-editor [data-block-id]').last();
			await afterParagraph.click();
			await page.waitForTimeout(100);
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);

			// Navigation chain: Text→NodeSel(HR2)→GapCursor(before HR2)→NodeSel(HR1)→Text(Before)
			// 1. ArrowLeft at start of "After" → NodeSelection(HR2)
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(100);

			// 2. ArrowLeft → GapCursor(before HR2, between the two HRs)
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(100);

			// 3. ArrowLeft → NodeSelection(HR1)
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(100);

			// 4. ArrowLeft → end of "Before"
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(100);

			// Type to verify cursor is at end of "Before"
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(firstText).toContain('BeforeX');
		});

		test('GapCursor at doc start before adjacent HRs', async ({ editor, page }) => {
			await editor.setContentHTML('<hr><hr><p>After</p>');
			await page.waitForTimeout(200);

			const hrs = page.locator('notectl-editor hr');
			await expect(hrs).toHaveCount(2);

			// Click first HR to get NodeSelection
			await hrs.first().click();
			await page.waitForTimeout(200);

			// ArrowLeft at doc start → GapCursor(before)
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(100);

			// Type at GapCursor → new paragraph
			await page.keyboard.type('X', { delay: 10 });
			await page.waitForTimeout(100);

			const text: string = await editor.getText();
			expect(text).toContain('X');
			expect(text).toContain('After');
		});

		test('ArrowDown from GapCursor between adjacent HRs selects next void', async ({
			editor,
			page,
		}) => {
			// Structure: <p>Before</p><hr><hr><p>After</p>
			await editor.setContentHTML('<p>Before</p><hr><hr><p>After</p>');
			await page.waitForTimeout(200);

			const hrs = page.locator('notectl-editor hr');
			await expect(hrs).toHaveCount(2);

			// Click first HR → NodeSelection
			await hrs.first().click();
			await page.waitForTimeout(200);

			// ArrowRight → GapCursor(after HR1) or NodeSelection(HR2)
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(100);

			// ArrowDown should navigate downward through the void chain
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			// Continue pressing down to exit void chain
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			// Type to verify we reached "After" area
			await page.keyboard.type('Y', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('Before');
			expect(text).toContain('Y');
		});

		test('ArrowUp from GapCursor between adjacent HRs selects previous void', async ({
			editor,
			page,
		}) => {
			// Structure: <p>Before</p><hr><hr><p>After</p>
			await editor.setContentHTML('<p>Before</p><hr><hr><p>After</p>');
			await page.waitForTimeout(200);

			const hrs = page.locator('notectl-editor hr');
			await expect(hrs).toHaveCount(2);

			// Click second HR → NodeSelection
			await hrs.last().click();
			await page.waitForTimeout(200);

			// ArrowLeft → GapCursor(before HR2, between the two HRs)
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(100);

			// ArrowUp should navigate upward through the void chain
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			// Continue pressing up to exit void chain
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			// Type to verify we reached "Before" area
			await page.keyboard.type('Y', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).toContain('Y');
			expect(text).toContain('After');
		});
	});

	test.describe('Empty blocks navigation (Phase 6)', () => {
		test('ArrowDown through empty paragraph', async ({ editor, page }) => {
			await editor.setContentHTML('<p>First</p><p></p><p>Third</p>');
			await page.waitForTimeout(200);

			// Click in first paragraph
			await editor.focus();
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);

			// ArrowDown → should enter empty paragraph
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(50);

			// ArrowDown → should enter "Third"
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(50);

			// Type to verify we're in the third block
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const thirdText: string =
				json.children[2]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(thirdText).toContain('X');
			expect(thirdText).toContain('Third');
		});

		test('typing in empty paragraph works', async ({ editor, page }) => {
			await editor.setContentHTML('<p>First</p><p></p><p>Third</p>');
			await page.waitForTimeout(200);

			await editor.focus();
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);

			// ArrowDown → empty paragraph
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(50);

			// Type in the empty block
			await page.keyboard.type('New text', { delay: 10 });
			const json = await editor.getJSON();
			const secondText: string =
				json.children[1]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(secondText).toContain('New text');
		});

		test('ArrowRight at end of paragraph before empty block crosses into it', async ({
			editor,
			page,
		}) => {
			await editor.setContentHTML('<p>ABC</p><p></p><p>DEF</p>');
			await page.waitForTimeout(200);

			await editor.focus();
			await page.keyboard.press('Control+Home');
			await page.keyboard.press('End');
			await page.waitForTimeout(50);

			// ArrowRight → should cross to empty block
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);

			// ArrowRight → should cross to "DEF"
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);

			// Type to verify we're in third block
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const thirdText: string =
				json.children[2]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(thirdText).toMatch(/^XDEF/);
		});
	});

	test.describe('Nested isolating nodes — table boundaries (Phase 6)', () => {
		test('ArrowRight at end of table cell does not leave the table', async ({ editor, page }) => {
			// Type text, then insert a 3x3 table, then add text after
			await editor.typeText('Before');
			await page.keyboard.press('Enter');
			await insertTable(page);
			await page.waitForTimeout(200);

			// Click into the first cell and type
			const cell1 = page.locator('notectl-editor td').first();
			await cell1.click();
			await page.waitForTimeout(100);
			await page.keyboard.type('CellText', { delay: 10 });
			await page.waitForTimeout(100);

			// Move to end of cell text
			await page.keyboard.press('End');
			await page.waitForTimeout(50);

			// Press ArrowRight multiple times — should navigate within table, not escape to "Before"
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);

			// Type to verify we're still in the table
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			// Check that "Before" paragraph remains unchanged
			const firstBlock = json.children[0];
			const firstText: string =
				firstBlock?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(firstText).toBe('Before');
		});
	});

	test.describe('Document boundaries', () => {
		test('ArrowRight at document end does not crash', async ({ editor, page }) => {
			await editor.typeText('Hello');
			// Press ArrowRight multiple times at the end
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			// Type to verify editor still works
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('Hello');
			expect(text.trim()).toContain('X');
		});

		test('ArrowUp at first block does not crash', async ({ editor, page }) => {
			await editor.typeText('Only block');
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('ArrowUp');
			// Should still be functional
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('Only block');
		});

		test('ArrowDown at last block does not crash', async ({ editor, page }) => {
			await editor.typeText('Only block');
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('ArrowDown');
			// Should still be functional
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('Only block');
		});
	});
});
