import type { Page } from '@playwright/test';
import { test } from './fixtures/editor-page';

/**
 * Demo showcase — types a compact "Software Requirements" document.
 * Run with:
 *
 *   npx playwright test e2e/demo-showcase.spec.ts --project=chromium --headed
 *
 * A GIF is saved to e2e/screenshots/demo.gif automatically.
 */

const D = 25; // typing delay (ms)
const P = 500; // pause between sections

test.use({
	viewport: { width: 1100, height: 1050 },
	video: { mode: 'on', size: { width: 1100, height: 1050 } },
});

/** Refocus editor without moving cursor. */
async function refocus(page: Page): Promise<void> {
	await page.evaluate(() => {
		const el = document.querySelector('notectl-editor');
		const c = el?.shadowRoot?.querySelector('.notectl-content') as HTMLElement | null;
		c?.focus();
	});
	await page.waitForTimeout(100);
}

test.describe('Demo Showcase', () => {
	test.setTimeout(120_000);

	test('software requirements paper', async ({ editor, page }) => {
		// Enlarge editor so full document fits without scrolling
		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement | null;
			if (el) el.style.setProperty('--notectl-content-min-height', '850px');
		});
		await page.waitForTimeout(200);

		await editor.focus();
		const kb = page.keyboard;

		// ── Title ─────────────────────────────────────────────────
		await kb.type('# ', { delay: D });
		await kb.type('Software Requirements Specification', { delay: D });
		await page.waitForTimeout(P);
		await kb.press('Enter');

		// ── Subtitle ──────────────────────────────────────────────
		await kb.type('## ', { delay: D });
		await kb.type('notectl Editor — v2.0', { delay: D });
		await kb.press('Enter');

		// ── Intro paragraph with formatting ───────────────────────
		await kb.type('This document defines the ', { delay: D });
		await kb.press('Control+b');
		await kb.type('core requirements', { delay: D });
		await kb.press('Control+b');
		await kb.type(' for the next release of the ', { delay: D });
		await kb.press('Control+i');
		await kb.type('notectl', { delay: D });
		await kb.press('Control+i');
		await kb.type(' rich text editor.', { delay: D });
		await page.waitForTimeout(P);
		await kb.press('Enter');

		// ── Horizontal Rule ───────────────────────────────────────
		await kb.type('--- ', { delay: D });

		// ── Requirements Table ────────────────────────────────────
		await kb.type('### ', { delay: D });
		await kb.type('Requirements Matrix', { delay: D });
		await kb.press('Enter');

		await page.evaluate(() => {
			type EditorEl = HTMLElement & { executeCommand(name: string): boolean };
			const el = document.querySelector('notectl-editor') as EditorEl;
			el.executeCommand('insertTable');
		});
		await page.waitForTimeout(500);

		const firstCell = page.locator('notectl-editor td').first();
		await firstCell.click();
		await page.waitForTimeout(200);

		// Header row
		await kb.type('Requirement', { delay: D });
		await kb.press('Tab');
		await kb.type('Priority', { delay: D });
		await kb.press('Tab');
		await kb.type('Status', { delay: D });
		await kb.press('Tab');

		// Row 1 — bold requirement, colored priority
		await kb.press('Control+b');
		await kb.type('Plugin API', { delay: D });
		await kb.press('Control+b');
		await kb.press('Tab');
		await kb.type('High', { delay: D });
		// Select "High" and apply text color
		await kb.press('Home');
		await kb.press('Shift+End');
		await editor.markButton('textColor').click();
		const cp1 = page.locator('notectl-editor .notectl-color-picker');
		await cp1.waitFor({ state: 'visible', timeout: 5_000 });
		await cp1.locator('.notectl-color-picker__swatch').nth(1).click();
		await page.waitForTimeout(200);
		await refocus(page);
		await kb.press('Tab');
		await kb.press('Control+i');
		await kb.type('In Progress', { delay: D });
		await kb.press('Control+i');
		await kb.press('Tab');

		// Row 2 — bold requirement, colored priority
		await kb.press('Control+b');
		await kb.type('Accessibility', { delay: D });
		await kb.press('Control+b');
		await kb.press('Tab');
		await kb.type('Critical', { delay: D });
		// Select "Critical" and highlight
		await kb.press('Home');
		await kb.press('Shift+End');
		await editor.markButton('highlight').click();
		const cp2 = page.locator('notectl-editor .notectl-color-picker');
		await cp2.waitFor({ state: 'visible', timeout: 5_000 });
		await cp2.locator('.notectl-color-picker__swatch').nth(0).click();
		await page.waitForTimeout(200);
		await refocus(page);
		await kb.press('Tab');
		await kb.press('Control+u');
		await kb.type('Complete', { delay: D });
		await kb.press('Control+u');

		await page.waitForTimeout(P);

		// Move past the table
		await kb.press('Control+End');
		await page.waitForTimeout(200);
		await kb.press('Enter');

		// ── Horizontal Rule ───────────────────────────────────────
		await kb.type('--- ', { delay: D });

		// ── Code Block ────────────────────────────────────────────
		await kb.type('### ', { delay: D });
		await kb.type('Example: Plugin Registration', { delay: D });
		await kb.press('Enter');

		await kb.type('```typescript ', { delay: D });
		await page.waitForTimeout(300);

		await kb.type('function registerPlugin(editor: Editor): void {', { delay: D });
		await kb.press('Enter');
		await kb.type("  const api = editor.getPluginAPI('formatting');", { delay: D });
		await kb.press('Enter');
		await kb.type("  api.registerMark('highlight', {", { delay: D });
		await kb.press('Enter');
		await kb.type("    tag: 'MARK',", { delay: D });
		await kb.press('Enter');
		await kb.type('    priority: 10,', { delay: D });
		await kb.press('Enter');
		await kb.type('  });', { delay: D });
		await kb.press('Enter');
		await kb.type('}', { delay: D });
		await page.waitForTimeout(P);

		await kb.press('Escape');
		await page.waitForTimeout(200);

		// ── Mini checklist ────────────────────────────────────────
		await kb.type('### ', { delay: D });
		await kb.type('Next Steps', { delay: D });
		await kb.press('Enter');

		await kb.type('[ ] ', { delay: D });
		await kb.type('Review API surface', { delay: D });
		await kb.press('Enter');
		await kb.type('Implement middleware hooks', { delay: D });
		await kb.press('Enter');
		await kb.type('Write integration tests', { delay: D });
		await page.waitForTimeout(P);
		await kb.press('Enter');
		await kb.press('Enter');

		// ── Final scroll + screenshot ─────────────────────────────
		await kb.press('Escape');
		await page.waitForTimeout(200);

		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			el?.shadowRoot?.querySelector('.notectl-content')?.scrollTo({ top: 0, behavior: 'smooth' });
		});
		await page.waitForTimeout(1000);

		await page.evaluate(() => window.scrollTo({ top: 0 }));
		await page.waitForTimeout(300);
		await page.screenshot({ path: 'e2e/screenshots/demo-full.png', fullPage: true });

		// Save the recorded video and convert to high-quality GIF (2-pass palette)
		await page.close(); // finalize video
		const video = page.video();
		if (video) {
			const videoPath = await video.path();
			const { execSync } = await import('node:child_process');
			const gifPath = 'e2e/screenshots/demo.gif';
			const palettePath = '/tmp/notectl-demo-palette.png';
			const filters = 'fps=20,scale=1100:-1:flags=lanczos';
			// Pass 1: extract optimal 256-color palette
			execSync(
				`ffmpeg -y -i "${videoPath}" -vf "${filters},palettegen=stats_mode=diff" "${palettePath}"`,
			);
			// Pass 2: render GIF using palette with dithering
			execSync(
				`ffmpeg -y -i "${videoPath}" -i "${palettePath}" -lavfi "${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3" -loop 0 "${gifPath}"`,
			);
		}
	});
});
