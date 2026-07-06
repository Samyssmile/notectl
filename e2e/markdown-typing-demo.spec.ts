/**
 * Records the Markdown guide's live-typing GIF
 * (`docs-site/src/assets/screenshots/markdown-live-typing.gif`).
 *
 * This is NOT a correctness test. It mounts the full editor, frames it as a
 * clean, tightly-cropped product surface (chrome hidden, short fixed height,
 * no scrolling), types a short snippet that triggers every Markdown
 * shorthand documented in the guide's "Live Markdown typing" table (see
 * `fixtures/markdown-demo-script.ts`), records the viewport to WebM, and
 * transcodes that to an optimized GIF with ffmpeg.
 *
 * It is excluded from normal e2e runs (see `playwright.config.ts` testIgnore)
 * and only runs through the dedicated `playwright.markdown-demo.config.ts`:
 *
 *   pnpm --filter @notectl/core build   # e2e serves the built dist/
 *   pnpm markdown-demo:record
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { EditorPage } from './fixtures/editor-page';
import { buildMarkdownTypingDemo } from './fixtures/markdown-demo-script';

// ── Recording geometry ──────────────────────────────────────────
// Narrow and short: the snippet is five short lines, so the frame is
// cropped tightly to the editor instead of the tall canvas the README hero
// GIF uses.
const VIEW_WIDTH: number = 760;
const VIEW_HEIGHT: number = 560;
const SCALE: number = 2; // 2× render → crisp text after downscale
const GIF_WIDTH: number = 640; // small, embedded inline in the docs guide
const GIF_FPS: number = 20;

const REPO_ROOT: string = process.cwd();
const OUTPUT_GIF: string = resolve(
	REPO_ROOT,
	'docs-site/src/assets/screenshots/markdown-live-typing.gif',
);

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
		--notectl-content-min-height: 300px !important;
	}
`;

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

test('record Markdown live-typing GIF', async ({ browser }) => {
	test.setTimeout(120_000);

	const videoDir: string = mkdtempSync(join(tmpdir(), 'notectl-markdown-demo-'));
	const context = await browser.newContext({
		viewport: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
		deviceScaleFactor: SCALE,
		colorScheme: 'light',
		// `size` is in CSS pixels (the viewport's units), NOT device pixels — it
		// must equal the viewport or Playwright pads the canvas with grey.
		recordVideo: { dir: videoDir, size: { width: VIEW_WIDTH, height: VIEW_HEIGHT } },
	});

	const page = await context.newPage();
	const editor = new EditorPage(page);
	await editor.goto();
	await page.addStyleTag({ content: FRAME_CSS });

	await page.waitForTimeout(600); // settle layout + autofocus before typing
	await editor.focus();

	await buildMarkdownTypingDemo(page);

	const video = page.video();
	expect(video).not.toBeNull();
	await context.close(); // finalizes the WebM file
	const webmPath: string = await (video as NonNullable<typeof video>).path();

	transcodeToGif(webmPath);

	const bytes: number = statSync(OUTPUT_GIF).size;
	expect(bytes).toBeGreaterThan(10_000);
	expect(bytes).toBeLessThan(3_000_000);
});
