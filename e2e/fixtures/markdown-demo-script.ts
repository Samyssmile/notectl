/**
 * Document recipe for the Markdown live-typing GIF
 * (`docs-site/src/assets/screenshots/markdown-live-typing.gif`).
 *
 * Types a short snippet that exercises the five Markdown shortcuts documented
 * in the "Live Markdown typing" table of the Markdown guide, one per line so
 * each transformation reads clearly in the recording:
 *
 *   `# `          -> heading
 *   `**bold**`    -> bold
 *   `~~strike~~`  -> strikethrough
 *   `> `          -> blockquote
 *   ` ``` `       -> code block
 *
 * Kept intentionally small so the resulting GIF stays a few seconds and a
 * few hundred kilobytes. Shares the low-level `typeText` primitive with the
 * README hero GIF recipe (`demo-script.ts`) to keep a single typing helper.
 */
import type { Page } from '@playwright/test';
import { typeText } from './showcase-data.js';

/** Pause after a shortcut fires so a viewer can register the transformation. */
const REVEAL_PAUSE: number = 700;

async function reveal(page: Page): Promise<void> {
	await page.waitForTimeout(REVEAL_PAUSE);
}

/**
 * Types the full Markdown-shortcuts snippet into a freshly mounted editor.
 *
 * @param page Playwright page driving the keyboard.
 */
export async function buildMarkdownTypingDemo(page: Page): Promise<void> {
	// `# ` + space -> heading
	await typeText(page, '# ');
	await typeText(page, 'Markdown Shortcuts');
	await reveal(page);
	await page.keyboard.press('Enter');

	// `**bold**` -> bold. The marked word stays last on the line: the bold
	// mark is inclusive and would otherwise bleed onto trailing characters.
	await typeText(page, 'Make text ');
	await typeText(page, '**bold**');
	await reveal(page);
	await page.keyboard.press('Enter');

	// `~~strike~~` -> strikethrough. Same last-on-the-line rule as bold.
	await typeText(page, 'Or ');
	await typeText(page, '~~strike it~~');
	await reveal(page);
	await page.keyboard.press('Enter');

	// `> ` + space -> blockquote. Exit via double-Enter: the first Enter adds
	// an empty trailing line inside the quote, the second exits it.
	await typeText(page, '> ');
	await typeText(page, 'Type it, see it, instantly.');
	await reveal(page);
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	// ``` + space -> code block.
	await typeText(page, '``` ');
	await reveal(page);
	await typeText(page, 'editor.setContentMarkdown(md);');
	await page.waitForTimeout(1200); // hold on the finished snippet
}
