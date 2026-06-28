/**
 * Records the README hero GIF (`e2e/demo.gif`).
 *
 * This is NOT a correctness test. It mounts the full editor, frames it as a
 * clean product surface (chrome hidden, toolbar pinned, content scrolling
 * internally), types a complete document that exercises every shipped plugin
 * (see `demo-script.ts`), records the viewport to WebM, and transcodes that
 * to an optimized GIF with ffmpeg.
 *
 * It is excluded from normal e2e runs (see `playwright.config.ts` testIgnore)
 * and only runs through the dedicated `playwright.demo.config.ts`:
 *
 *   pnpm --filter @notectl/core build   # e2e serves the built dist/
 *   pnpm demo:record
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { buildDemoDocument } from './fixtures/demo-script';
import { EditorPage } from './fixtures/editor-page';

// ── Recording geometry ──────────────────────────────────────────
// Wide enough that the full toolbar stays on one row (no overflow burger,
// otherwise toolbar clicks would miss), tall enough for a near-square frame.
const VIEW_WIDTH: number = 1040;
const VIEW_HEIGHT: number = 940;
const SCALE: number = 2; // 2× render → crisp text after downscale
const GIF_WIDTH: number = 720; // final width shown in the README
const GIF_FPS: number = 20;

const REPO_ROOT: string = process.cwd();
const OUTPUT_GIF: string = resolve(REPO_ROOT, 'e2e/demo.gif');
const IMAGE_FILE: string = resolve(REPO_ROOT, 'media/logo.png');

/** Strips the page chrome and frames the bare editor as a product surface. */
const FRAME_CSS: string = `
	.header, .actions-bar, .inspect-panel { display: none !important; }
	.main {
		grid-template-columns: minmax(0, 1fr) !important;
		grid-template-rows: auto !important;
		max-width: ${VIEW_WIDTH - 40}px !important;
		margin: 0 auto !important;
		padding: 20px !important;
	}
	body { background: #eef1f6 !important; }
	#editor-container { grid-column: 1 !important; grid-row: 1 !important; }
	notectl-editor {
		--notectl-content-min-height: 800px !important;
		--notectl-content-max-height: 800px !important;
	}
`;

function readImageAsDataUri(): string {
	const base64: string = readFileSync(IMAGE_FILE).toString('base64');
	return `data:image/png;base64,${base64}`;
}

/** Transcodes the recorded WebM to an optimized, palette-based GIF. */
function transcodeToGif(webmPath: string): void {
	const palette = 'split[a][b];[a]palettegen=max_colors=216:stats_mode=diff[p]';
	const filters = `fps=${GIF_FPS},scale=${GIF_WIDTH}:-2:flags=lanczos,${palette};[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;
	execFileSync('ffmpeg', ['-y', '-i', webmPath, '-vf', filters, '-loop', '0', OUTPUT_GIF], {
		stdio: 'pipe',
	});
	// Drop redundant inter-frame pixels to shrink the file further.
	execFileSync('magick', [OUTPUT_GIF, '-layers', 'Optimize', OUTPUT_GIF], { stdio: 'pipe' });
}

test('record README demo GIF', async ({ browser }) => {
	test.setTimeout(240_000);

	const videoDir: string = mkdtempSync(join(tmpdir(), 'notectl-demo-'));
	const context = await browser.newContext({
		viewport: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
		deviceScaleFactor: SCALE, // renders at 2× internally for crisp text
		colorScheme: 'light',
		// `size` is in CSS pixels (the viewport's units), NOT device pixels — it
		// must equal the viewport or Playwright pads the canvas with grey.
		recordVideo: { dir: videoDir, size: { width: VIEW_WIDTH, height: VIEW_HEIGHT } },
	});

	const page = await context.newPage();
	const editor = new EditorPage(page);
	await editor.goto();
	await page.addStyleTag({ content: FRAME_CSS });

	// Programmatic typing does not auto-scroll the caret into view, so the
	// content area is pinned to its bottom (where the caret sits during this
	// top-down build). This makes the recording follow the writing naturally.
	await page.evaluate(() => {
		const host = document.querySelector('notectl-editor');
		const scope: ParentNode = host?.shadowRoot ?? document;
		const content = scope.querySelector('.notectl-content');
		if (content) {
			window.setInterval(() => {
				content.scrollTop = content.scrollHeight;
			}, 120);
		}
	});

	await page.waitForTimeout(600); // settle layout + autofocus before typing

	await buildDemoDocument(page, editor, readImageAsDataUri());

	const video = page.video();
	expect(video).not.toBeNull();
	await context.close(); // finalizes the WebM file
	const webmPath: string = await (video as NonNullable<typeof video>).path();

	transcodeToGif(webmPath);

	const bytes: number = statSync(OUTPUT_GIF).size;
	expect(bytes).toBeGreaterThan(50_000);
	expect(bytes).toBeLessThan(15_000_000);
});
