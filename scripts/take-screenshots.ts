/**
 * Playwright screenshot script for notectl documentation.
 * Takes screenshots of the editor in various states.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = join('/home/caedmon/work/notectl', 'docs-site', 'src', 'assets', 'screenshots');
const BASE_URL = 'http://localhost:3000';

mkdirSync(OUTPUT_DIR, { recursive: true });

async function main(): Promise<void> {
	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1280, height: 800 },
		deviceScaleFactor: 2,
	});
	const page = await context.newPage();

	await page.goto(BASE_URL);
	await page.waitForSelector('notectl-editor');
	await page.waitForTimeout(1000);

	// --- Screenshot 1: Empty editor with toolbar ---
	const editor = page.locator('notectl-editor');
	await editor.screenshot({ path: join(OUTPUT_DIR, 'editor-empty.png') });

	// --- Screenshot 2: Editor with formatted content ---
	const editorContent = editor.locator('div.notectl-content');
	await editorContent.focus();

	// Type a heading
	await page.keyboard.type('Welcome to notectl');
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');

	// Use the heading toolbar item — click on it
	const shadow = editor.locator('div.notectl-plugin-container--top');
	// Find heading dropdown
	const headingBtn = shadow.locator('button[data-toolbar-id="heading"]');
	if ((await headingBtn.count()) > 0) {
		await headingBtn.click();
		await page.waitForTimeout(300);
		// Click H1 option
		const h1Option = page.locator('button:has-text("Heading 1")').first();
		if ((await h1Option.count()) > 0) {
			await h1Option.click();
		}
	}

	await page.keyboard.press('End');
	await page.keyboard.press('Enter');

	// Type some regular text
	await page.keyboard.type('A powerful rich text editor shipped as a Web Component. ');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	// Type bold text
	await page.keyboard.press('Control+b');
	await page.keyboard.type('Bold text');
	await page.keyboard.press('Control+b');
	await page.keyboard.type(', ');

	// Italic
	await page.keyboard.press('Control+i');
	await page.keyboard.type('italic text');
	await page.keyboard.press('Control+i');
	await page.keyboard.type(', and ');

	// Underline
	await page.keyboard.press('Control+u');
	await page.keyboard.type('underlined text');
	await page.keyboard.press('Control+u');
	await page.keyboard.type('.');

	await page.waitForTimeout(500);
	await editor.screenshot({ path: join(OUTPUT_DIR, 'editor-formatted.png') });

	// --- Screenshot 3: Editor with toolbar visible (full) ---
	// Clear and type fresh content
	await page.keyboard.press('Control+a');
	await page.keyboard.type('The quick brown fox jumps over the lazy dog');
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');

	await page.waitForTimeout(300);
	await editor.screenshot({ path: join(OUTPUT_DIR, 'editor-with-selection.png') });

	// --- Screenshot 4: Toolbar close-up ---
	const toolbar = shadow.first();
	if ((await toolbar.count()) > 0) {
		await toolbar.screenshot({ path: join(OUTPUT_DIR, 'toolbar-closeup.png') });
	}

	// --- Screenshot 5: Font dropdown open ---
	const fontBtn = shadow.locator('button[data-toolbar-id="font"]');
	if ((await fontBtn.count()) > 0) {
		await fontBtn.click();
		await page.waitForTimeout(500);
		await editor.screenshot({ path: join(OUTPUT_DIR, 'font-dropdown.png') });
		// dismiss
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	}

	// --- Screenshot 6: Font size dropdown ---
	const fontSizeBtn = shadow.locator('button[data-toolbar-id="fontSize"]');
	if ((await fontSizeBtn.count()) > 0) {
		await fontSizeBtn.click();
		await page.waitForTimeout(500);
		await editor.screenshot({ path: join(OUTPUT_DIR, 'font-size-dropdown.png') });
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	}

	// --- Screenshot 7: List content ---
	await editorContent.focus();
	await page.keyboard.press('Control+a');
	await page.keyboard.press('Backspace');

	await page.keyboard.type('Shopping List');
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');
	if ((await headingBtn.count()) > 0) {
		await headingBtn.click();
		await page.waitForTimeout(300);
		const h2Option = page.locator('button:has-text("Heading 2")').first();
		if ((await h2Option.count()) > 0) {
			await h2Option.click();
		}
	}
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');

	// Type list items
	await page.keyboard.type('- Apples');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Bananas');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Oranges');

	await page.waitForTimeout(500);
	await editor.screenshot({ path: join(OUTPUT_DIR, 'editor-with-list.png') });

	// --- Screenshot 8: Hero screenshot - rich content ---
	await editorContent.focus();
	await page.keyboard.press('Control+a');
	await page.keyboard.press('Backspace');

	// Build rich content for hero
	await page.keyboard.type('Getting Started with notectl');
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');
	if ((await headingBtn.count()) > 0) {
		await headingBtn.click();
		await page.waitForTimeout(300);
		const h1Option = page.locator('button:has-text("Heading 1")').first();
		if ((await h1Option.count()) > 0) {
			await h1Option.click();
		}
	}
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');

	await page.keyboard.type(
		'notectl is a modern, extensible rich text editor built as a Web Component. It features a powerful plugin system, immutable state management, and a clean API.',
	);
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	await page.keyboard.press('Control+b');
	await page.keyboard.type('Key Features:');
	await page.keyboard.press('Control+b');
	await page.keyboard.press('Enter');

	await page.keyboard.type('- Plugin-based architecture');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Immutable state with undo/redo');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Custom fonts and text styling');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Tables, lists, and block quotes');

	await page.waitForTimeout(500);

	// Take a large hero screenshot
	await editor.screenshot({ path: join(OUTPUT_DIR, 'hero-editor.png') });

	// Also take a full page screenshot
	await page.screenshot({ path: join(OUTPUT_DIR, 'full-page.png') });

	// --- Screenshot: Inline code plugin ---
	await editorContent.focus();
	await page.keyboard.press('Control+a');
	await page.keyboard.press('Backspace');

	await page.keyboard.type('Using Inline Code');
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');
	if ((await headingBtn.count()) > 0) {
		await headingBtn.click();
		await page.waitForTimeout(300);
		const h2Option = page.locator('button:has-text("Heading 2")').first();
		if ((await h2Option.count()) > 0) {
			await h2Option.click();
		}
	}
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');

	// Line with inline code via keyboard shortcut
	await page.keyboard.type('Call the ');
	await page.keyboard.press('Control+e');
	await page.keyboard.type('toggleMark()');
	await page.keyboard.press('Control+e');
	await page.keyboard.type(' function to apply formatting.');
	await page.keyboard.press('Enter');

	// Another line with inline code via backtick input rule
	await page.keyboard.type('Use the ');
	await page.keyboard.press('Control+e');
	await page.keyboard.type('EditorState');
	await page.keyboard.press('Control+e');
	await page.keyboard.type(' class for immutable state management.');
	await page.keyboard.press('Enter');

	// Mixed formatting to show exclusivity
	await page.keyboard.type('Inline code like ');
	await page.keyboard.press('Control+e');
	await page.keyboard.type('const x = 42');
	await page.keyboard.press('Control+e');
	await page.keyboard.type(' stands out from ');
	await page.keyboard.press('Control+b');
	await page.keyboard.type('bold');
	await page.keyboard.press('Control+b');
	await page.keyboard.type(' and ');
	await page.keyboard.press('Control+i');
	await page.keyboard.type('italic');
	await page.keyboard.press('Control+i');
	await page.keyboard.type(' text.');

	await page.waitForTimeout(500);
	await editor.screenshot({ path: join(OUTPUT_DIR, 'plugin-inline-code.png') });

	await browser.close();
	console.log(`Screenshots saved to ${OUTPUT_DIR}`);
}

main().catch((err) => {
	console.error('Screenshot script failed:', err);
	process.exit(1);
});
