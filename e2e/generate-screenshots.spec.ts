/**
 * IMPORTANT: This file is a documentation asset generator for Starlight.
 *
 * Purpose:
 * - Generates screenshots into `docs-site/src/assets/screenshots`
 * - Those images are referenced by docs pages in `docs-site/src/content/docs`
 *
 * Notes:
 * - These are not core product-regression E2E tests.
 * - Do not delete this file when optimizing normal E2E runtime.
 * - Keep it as a separate docs-screenshot workflow.
 */
import { type Page, test } from '@playwright/test';

const DIR = 'docs-site/src/assets/screenshots';

test.use({
	viewport: { width: 1000, height: 900 },
	deviceScaleFactor: 2,
});

// ── ID Generator ───────────────────────────────────────────────

let counter = 0;
function uid(): string {
	return `ss-${++counter}`;
}

// ── JSON Document Builders ─────────────────────────────────────

type MarkDef = { type: string; attrs?: Record<string, unknown> };
type TextDef = { type: 'text'; text: string; marks: MarkDef[] };
type BlockDef = {
	id: string;
	type: string;
	attrs?: Record<string, unknown>;
	children: (TextDef | BlockDef)[];
};
type DocDef = { children: BlockDef[] };

function txt(t: string, ...marks: MarkDef[]): TextDef {
	return { type: 'text', text: t, marks };
}

function para(children: TextDef[], attrs?: Record<string, unknown>): BlockDef {
	return { id: uid(), type: 'paragraph', ...(attrs ? { attrs } : {}), children };
}

function heading(level: number, children: TextDef[]): BlockDef {
	return { id: uid(), type: 'heading', attrs: { level }, children };
}

function listItem(
	listType: 'bullet' | 'ordered' | 'checklist',
	children: TextDef[],
	opts: { indent?: number; checked?: boolean } = {},
): BlockDef {
	return {
		id: uid(),
		type: 'list_item',
		attrs: { listType, indent: opts.indent ?? 0, checked: opts.checked ?? false },
		children,
	};
}

function blockquote(children: TextDef[]): BlockDef {
	return { id: uid(), type: 'blockquote', children };
}

function hr(): BlockDef {
	return { id: uid(), type: 'horizontal_rule', children: [txt('')] };
}

function table(rows: TextDef[][][]): BlockDef {
	return {
		id: uid(),
		type: 'table',
		children: rows.map((cells) => ({
			id: uid(),
			type: 'table_row',
			children: cells.map((cellContent) => ({
				id: uid(),
				type: 'table_cell',
				children: cellContent,
			})),
		})),
	};
}

// ── Mark Helpers ───────────────────────────────────────────────

const bold: MarkDef = { type: 'bold' };
const italic: MarkDef = { type: 'italic' };
const underline: MarkDef = { type: 'underline' };
const strike: MarkDef = { type: 'strikethrough' };

function color(c: string): MarkDef {
	return { type: 'textColor', attrs: { color: c } };
}

function font(family: string): MarkDef {
	return { type: 'font', attrs: { family } };
}

function link(href: string): MarkDef {
	return { type: 'link', attrs: { href } };
}

// ── Page Helpers ───────────────────────────────────────────────

async function cleanPage(page: Page): Promise<void> {
	await page.evaluate(() => {
		for (const sel of ['h1', '.subtitle', '.controls', '.output']) {
			const el: HTMLElement | null = document.querySelector(sel);
			if (el) el.style.display = 'none';
		}
		document.body.style.background = '#ffffff';
		document.body.style.padding = '32px 20px';
		const app: HTMLElement | null = document.querySelector('.app');
		if (app) app.style.maxWidth = '960px';
	});
}

async function setEditorJSON(page: Page, doc: DocDef): Promise<void> {
	await page.evaluate(
		(d) =>
			(
				document.querySelector('notectl-editor') as unknown as { setJSON(d: unknown): void }
			).setJSON(d),
		doc,
	);
	await page.waitForTimeout(500);
}

async function setEditorHTML(page: Page, html: string): Promise<void> {
	await page.evaluate(
		(h) =>
			(document.querySelector('notectl-editor') as unknown as { setHTML(h: string): void }).setHTML(
				h,
			),
		html,
	);
	await page.waitForTimeout(500);
}

async function setPaperSize(page: Page, size: string | null): Promise<void> {
	await page.evaluate((s) => {
		const el = document.querySelector('notectl-editor') as unknown as {
			configure(c: Record<string, unknown>): void;
		};
		el.configure({ paperSize: s ?? undefined });
	}, size);
	await page.waitForTimeout(300);
}

async function setMinHeight(page: Page, px: string): Promise<void> {
	await page.evaluate((h) => {
		const el: HTMLElement | null = document.querySelector('notectl-editor');
		if (el) el.style.setProperty('--notectl-content-min-height', h);
	}, px);
}

async function shot(page: Page, name: string): Promise<void> {
	const editor = page.locator('notectl-editor');
	await editor.screenshot({ path: `${DIR}/${name}` });
}

async function toolbarShot(page: Page, name: string): Promise<void> {
	const toolbar = page.locator('notectl-editor').locator('[role="toolbar"]');
	await toolbar.screenshot({ path: `${DIR}/${name}` });
}

// ── Content Definitions ────────────────────────────────────────

const RICH_CONTENT: DocDef = {
	children: [
		heading(1, [txt('Product Launch Brief')]),
		para([
			txt('This document outlines the strategy for our '),
			txt('Q1 2025', bold),
			txt(' product launch. The team has identified key milestones that need to be '),
			txt('carefully coordinated', italic),
			txt(' across all departments.'),
		]),
		heading(2, [txt('Timeline & Milestones')]),
		table([
			[[txt('Phase', bold)], [txt('Timeline', bold)], [txt('Status', bold)], [txt('Lead', bold)]],
			[
				[txt('Research & Discovery')],
				[txt('Jan 1 – Jan 15')],
				[txt('Complete', color('#34a853'))],
				[txt('Sarah Chen')],
			],
			[
				[txt('Design & Prototyping')],
				[txt('Jan 16 – Feb 5')],
				[txt('Complete', color('#34a853'))],
				[txt('Alex Rivera')],
			],
			[
				[txt('Development Sprint')],
				[txt('Feb 6 – Mar 10')],
				[txt('In Progress', color('#4285f4'))],
				[txt('Dev Team')],
			],
			[
				[txt('QA & Testing')],
				[txt('Mar 11 – Mar 25')],
				[txt('Planned', color('#9e9e9e'))],
				[txt('QA Team')],
			],
			[
				[txt('Launch & Marketing')],
				[txt('Mar 26 – Apr 1')],
				[txt('Planned', color('#9e9e9e'))],
				[txt('Marketing')],
			],
		]),
		heading(2, [txt('Key Objectives')]),
		listItem('bullet', [
			txt('User Acquisition', bold),
			txt(' — Target 10,000 new signups in the first month'),
		]),
		listItem('bullet', [
			txt('Retention Rate', bold),
			txt(' — Maintain above 85% monthly active user retention'),
		]),
		listItem('bullet', [txt('Revenue', bold), txt(' — Achieve $50K MRR by end of Q1')]),
		blockquote([
			txt(
				'The best products are built with obsessive attention to detail and a deep understanding of user needs.',
				italic,
			),
		]),
		para([
			txt('For questions, contact the '),
			txt('project team', link('https://example.com')),
			txt(' or refer to the internal wiki.'),
		]),
	],
};

const TABLE_SHOWCASE: DocDef = {
	children: [
		heading(2, [txt('Q4 Performance Dashboard')]),
		para([txt('Key performance metrics across all product lines for the fourth quarter.')]),
		table([
			[
				[txt('Metric', bold)],
				[txt('October', bold)],
				[txt('November', bold)],
				[txt('December', bold)],
				[txt('Trend', bold)],
			],
			[
				[txt('Revenue', bold)],
				[txt('$124,500')],
				[txt('$138,200')],
				[txt('$156,800')],
				[txt('+26%', color('#34a853'))],
			],
			[
				[txt('Active Users', bold)],
				[txt('12,450')],
				[txt('15,280')],
				[txt('18,930')],
				[txt('+52%', color('#34a853'))],
			],
			[
				[txt('Retention', bold)],
				[txt('89.2%')],
				[txt('91.5%')],
				[txt('93.1%')],
				[txt('+3.9%', color('#34a853'))],
			],
			[
				[txt('NPS Score', bold)],
				[txt('72')],
				[txt('76')],
				[txt('81')],
				[txt('+9', color('#34a853'))],
			],
			[
				[txt('Avg. Session', bold)],
				[txt('4.2 min')],
				[txt('5.1 min')],
				[txt('6.8 min')],
				[txt('+62%', color('#34a853'))],
			],
		]),
		para([
			txt('Data updated as of December 31, 2024. All metrics on a rolling 30-day basis.', italic),
		]),
	],
};

const FORMATTED_CONTENT: DocDef = {
	children: [
		heading(1, [txt('Rich Text Formatting')]),
		para([
			txt('The '),
			txt('notectl', bold),
			txt(' editor supports a wide range of formatting. Make text '),
			txt('bold', bold),
			txt(', '),
			txt('italic', italic),
			txt(', '),
			txt('underlined', underline),
			txt(', or '),
			txt('strikethrough', strike),
			txt('.'),
		]),
		para([
			txt('Combine styles freely: '),
			txt('bold italic', bold, italic),
			txt(', '),
			txt('bold underlined', bold, underline),
			txt(', or even '),
			txt('all three', bold, italic, underline),
			txt(' at once.'),
		]),
		heading(2, [txt('Typography Options')]),
		para([
			txt('Choose from multiple '),
			txt('font families', font("'Fira Code', monospace")),
			txt(', and add '),
			txt('color ', color('#4285f4')),
			txt('to ', color('#ea4335')),
			txt('your ', color('#34a853')),
			txt('text', color('#fbbc04')),
			txt('.'),
		]),
	],
};

// ── Plugin-Specific Content ────────────────────────────────────

const TEXT_FORMATTING_CONTENT: DocDef = {
	children: [
		para([
			txt('This is '),
			txt('bold text', bold),
			txt(', this is '),
			txt('italic text', italic),
			txt(', and this is '),
			txt('underlined text', underline),
			txt('.'),
		]),
		para([
			txt('Combine them: '),
			txt('bold italic', bold, italic),
			txt(', '),
			txt('bold underline', bold, underline),
			txt(', '),
			txt('italic underline', italic, underline),
			txt('.'),
		]),
		para([
			txt('And even '),
			txt('all three together', bold, italic, underline),
			txt(' for maximum emphasis.'),
		]),
	],
};

const HEADING_CONTENT: DocDef = {
	children: [
		heading(1, [txt('Heading Level 1')]),
		para([txt('Body text under the main heading with descriptive content.')]),
		heading(2, [txt('Heading Level 2')]),
		para([txt('Sub-section content that provides more detail on the topic.')]),
		heading(3, [txt('Heading Level 3')]),
		para([txt('Deeper nesting for organizing complex documents with precision.')]),
	],
};

const LIST_CONTENT: DocDef = {
	children: [
		heading(3, [txt('Bullet List')]),
		listItem('bullet', [txt('Design the new user onboarding flow')]),
		listItem('bullet', [txt('Review accessibility compliance checklist')]),
		listItem('bullet', [txt('Update component library documentation')]),
		heading(3, [txt('Ordered List')]),
		listItem('ordered', [txt('Install the package from npm')]),
		listItem('ordered', [txt('Import the plugins you need')]),
		listItem('ordered', [txt('Configure the toolbar layout')]),
		heading(3, [txt('Checklist')]),
		listItem('checklist', [txt('Set up project repository')], { checked: true }),
		listItem('checklist', [txt('Write unit tests for core module')], { checked: true }),
		listItem('checklist', [txt('Deploy to staging environment')], { checked: false }),
	],
};

const TABLE_PLUGIN_CONTENT: DocDef = {
	children: [
		para([txt('A data table with headers, rich formatting, and multiple columns:')]),
		table([
			[[txt('Feature', bold)], [txt('Description', bold)], [txt('Status', bold)]],
			[
				[txt('Cell Selection')],
				[txt('Click and drag to select multiple cells')],
				[txt('Supported', color('#34a853'))],
			],
			[
				[txt('Row Operations')],
				[txt('Add or remove rows above and below')],
				[txt('Supported', color('#34a853'))],
			],
			[
				[txt('Column Operations')],
				[txt('Add or remove columns left and right')],
				[txt('Supported', color('#34a853'))],
			],
			[
				[txt('Keyboard Nav')],
				[txt('Tab, Shift+Tab, and arrow keys')],
				[txt('Supported', color('#34a853'))],
			],
		]),
	],
};

const BLOCKQUOTE_CONTENT: DocDef = {
	children: [
		para([txt('An important insight from our team lead:')]),
		blockquote([
			txt(
				'Great software is built in layers. Each layer should be independent, testable, and composable. This philosophy guides every design decision.',
				italic,
			),
		]),
		para([txt('This principle drives the architecture of notectl.')]),
	],
};

const FONT_CONTENT: DocDef = {
	children: [
		para([txt('The default system font renders clean, readable text for everyday use.')]),
		para([
			txt(
				'Fira Sans — A versatile sans-serif font for readability at any size.',
				font("'Fira Sans', sans-serif"),
			),
		]),
		para([
			txt(
				'Fira Code — A monospace font with coding ligatures for technical content.',
				font("'Fira Code', monospace"),
			),
		]),
		para([
			txt(
				'Inter — A variable font optimized for screen display with clean geometry.',
				font("'Inter', sans-serif"),
			),
		]),
	],
};

const TEXT_COLOR_CONTENT: DocDef = {
	children: [
		para([
			txt('Add '),
			txt('visual ', color('#4285f4')),
			txt('emphasis ', color('#ea4335')),
			txt('with ', color('#34a853')),
			txt('colors ', color('#fbbc04')),
			txt('to highlight important information.'),
		]),
		para([
			txt('The color picker provides a '),
			txt('rich palette ', color('#9c27b0')),
			txt('of '),
			txt('carefully ', color('#ff6d00')),
			txt('selected ', color('#00bcd4')),
			txt('colors ', color('#795548')),
			txt('inspired by '),
			txt('Google Docs', color('#607d8b')),
			txt('.'),
		]),
	],
};

const ALIGNMENT_CONTENT: DocDef = {
	children: [
		para(
			[
				txt(
					'Left-aligned text flows naturally from the left margin. This is the default alignment.',
				),
			],
			{
				align: 'left',
			},
		),
		para(
			[
				txt(
					'Center-aligned text is perfect for headings, titles, and quotes that need visual emphasis.',
				),
			],
			{ align: 'center' },
		),
		para(
			[txt('Right-aligned text works well for dates, signatures, and certain layout patterns.')],
			{
				align: 'right',
			},
		),
		para(
			[
				txt(
					'Justified text creates clean, even edges on both sides. This is commonly used in books and formal documents for a polished, professional appearance.',
				),
			],
			{ align: 'justify' },
		),
	],
};

const LINK_CONTENT: DocDef = {
	children: [
		para([
			txt('Add hyperlinks seamlessly. Visit the '),
			txt('notectl repository', link('https://github.com/Samyssmile/notectl')),
			txt(' to learn more, or check the '),
			txt('API documentation', link('https://example.com/docs')),
			txt(' for a detailed reference.'),
		]),
	],
};

const HR_CONTENT: DocDef = {
	children: [
		heading(2, [txt('Section One')]),
		para([txt('Content for the first section of the document with relevant information.')]),
		hr(),
		heading(2, [txt('Section Two')]),
		para([txt('Content for the second section, clearly separated by a horizontal rule.')]),
	],
};

// ── Test Suite ─────────────────────────────────────────────────

test.describe('Documentation screenshots', () => {
	test.beforeEach(async ({ page }) => {
		counter = 0;
		await page.goto('/');
		const editor = page.locator('notectl-editor');
		await editor.waitFor();
		await editor.locator('div.notectl-content').waitFor();
		await page.waitForTimeout(500);
		await cleanPage(page);
	});

	// ── Hero / Index Page ──────────────────────────────

	test('hero-editor-empty', async ({ page }) => {
		await shot(page, 'hero-editor-empty.png');
	});

	test('hero-editor-rich', async ({ page }) => {
		await setEditorJSON(page, RICH_CONTENT);
		// 2x zoom effect — clip top-left half; deviceScaleFactor:2 doubles resolution
		const box = await page.locator('notectl-editor').boundingBox();
		if (!box) throw new Error('editor not found');
		await page.screenshot({
			path: `${DIR}/hero-editor-rich.png`,
			clip: { x: box.x, y: box.y, width: box.width / 2, height: box.height / 2 },
		});
	});

	test('editor-table-showcase', async ({ page }) => {
		await setEditorJSON(page, TABLE_SHOWCASE);
		await shot(page, 'editor-table-showcase.png');
	});

	test('editor-formatted', async ({ page }) => {
		await setEditorJSON(page, FORMATTED_CONTENT);
		await shot(page, 'editor-formatted.png');
	});

	// ── Plugin Screenshots ─────────────────────────────

	test('plugin-text-formatting', async ({ page }) => {
		await setMinHeight(page, '120px');
		await setEditorJSON(page, TEXT_FORMATTING_CONTENT);
		await shot(page, 'plugin-text-formatting.png');
	});

	test('plugin-heading', async ({ page }) => {
		await setMinHeight(page, '120px');
		await setEditorJSON(page, HEADING_CONTENT);
		await shot(page, 'plugin-heading.png');
	});

	test('plugin-list', async ({ page }) => {
		await setMinHeight(page, '120px');
		await setEditorJSON(page, LIST_CONTENT);
		await shot(page, 'plugin-list.png');
	});

	test('plugin-table', async ({ page }) => {
		await setMinHeight(page, '120px');
		await setEditorJSON(page, TABLE_PLUGIN_CONTENT);
		await shot(page, 'plugin-table.png');
	});

	test('table-context-menu', async ({ page }) => {
		await setMinHeight(page, '500px');
		await setEditorJSON(page, TABLE_PLUGIN_CONTENT);
		// Click a cell in the middle of the table (not the first cell) for better positioning
		const cell = page.locator('notectl-editor td').nth(4);
		await cell.click();
		await page.waitForTimeout(200);
		await cell.click({ button: 'right' });
		await page.waitForTimeout(500);
		// Use page screenshot to capture the context menu (which uses position:fixed)
		const box = await page.locator('notectl-editor').boundingBox();
		if (!box) throw new Error('editor not found');
		await page.screenshot({
			path: `${DIR}/table-context-menu.png`,
			clip: { x: box.x, y: box.y, width: box.width, height: box.height },
		});
	});

	test('table-border-color', async ({ page }) => {
		// Increase viewport to fit the full color picker
		await page.setViewportSize({ width: 1000, height: 1000 });
		await setMinHeight(page, '600px');
		await setEditorJSON(page, TABLE_PLUGIN_CONTENT);
		// Hide any elements below the editor (e.g. theme toggle button)
		await page.evaluate(() => {
			const editor: HTMLElement | null = document.querySelector('notectl-editor');
			if (editor?.nextElementSibling) {
				(editor.nextElementSibling as HTMLElement).style.display = 'none';
			}
		});
		// Click a cell for better positioning
		const cell = page.locator('notectl-editor td').nth(4);
		await cell.click();
		await page.waitForTimeout(300);
		await cell.click({ button: 'right' });
		// Wait for the context menu to appear before navigating
		const firstMenuItem = page.locator('[role="menuitem"]').first();
		await firstMenuItem.waitFor({ state: 'visible', timeout: 3000 });
		await page.waitForTimeout(200);
		// Use keyboard to navigate down to "Border Color..." item
		// Menu items: Insert Row Above, Insert Row Below, Insert Column Left,
		// Insert Column Right, Delete Row, Delete Column, Border Color..., Delete Table
		// Navigate: 6 ArrowDowns to reach Border Color...
		for (let i = 0; i < 6; i++) {
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);
		}
		// Open submenu with ArrowRight
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(700);
		// Use page screenshot to capture both menus (which use position:fixed)
		const box = await page.locator('notectl-editor').boundingBox();
		if (!box) throw new Error('editor not found');
		await page.screenshot({
			path: `${DIR}/table-border-color.png`,
			clip: { x: box.x, y: box.y, width: box.width, height: box.height },
		});
	});

	test('plugin-blockquote', async ({ page }) => {
		await setMinHeight(page, '80px');
		await setEditorJSON(page, BLOCKQUOTE_CONTENT);
		await shot(page, 'plugin-blockquote.png');
	});

	test('plugin-font', async ({ page }) => {
		await setMinHeight(page, '120px');
		await setEditorJSON(page, FONT_CONTENT);
		await shot(page, 'plugin-font.png');
	});

	test('plugin-text-color', async ({ page }) => {
		await setMinHeight(page, '100px');
		await setEditorJSON(page, TEXT_COLOR_CONTENT);
		await shot(page, 'plugin-text-color.png');
	});

	test('plugin-text-alignment', async ({ page }) => {
		await setMinHeight(page, '120px');
		await setEditorJSON(page, ALIGNMENT_CONTENT);
		await shot(page, 'plugin-text-alignment.png');
	});

	test('plugin-link', async ({ page }) => {
		await setMinHeight(page, '60px');
		await setEditorJSON(page, LINK_CONTENT);
		await shot(page, 'plugin-link.png');
	});

	test('plugin-horizontal-rule', async ({ page }) => {
		await setMinHeight(page, '120px');
		await setEditorJSON(page, HR_CONTENT);
		await shot(page, 'plugin-horizontal-rule.png');
	});

	// ── Paper Mode Screenshots ────────────────────────

	test('paper-mode-a4', async ({ page }) => {
		await setPaperSize(page, 'din-a4');
		await setEditorJSON(page, RICH_CONTENT);
		await shot(page, 'paper-mode-a4.png');
	});

	test('editor-fluid', async ({ page }) => {
		await setPaperSize(page, null);
		await setEditorJSON(page, RICH_CONTENT);
		await shot(page, 'editor-fluid.png');
	});

	// ── Toolbar ──────────────────────────────────────

	test('toolbar-full', async ({ page }) => {
		await toolbarShot(page, 'toolbar-full.png');
	});

	// ── Toolbar Overflow ─────────────────────────────

	test('toolbar-overflow-burger', async ({ page }) => {
		await page.setViewportSize({ width: 500, height: 900 });
		await page.waitForTimeout(500);
		await shot(page, 'toolbar-overflow-burger.png');
	});

	test('toolbar-overflow-burger-open', async ({ page }) => {
		await page.setViewportSize({ width: 500, height: 900 });
		await page.waitForTimeout(500);
		const overflowBtn = page.locator('notectl-editor .notectl-toolbar-overflow-btn');
		await overflowBtn.click();
		await page.waitForTimeout(500);
		// Use page screenshot with clip to capture the overflow dropdown (position:fixed)
		const box = await page.locator('notectl-editor').boundingBox();
		if (!box) throw new Error('editor not found');
		await page.screenshot({
			path: `${DIR}/toolbar-overflow-burger-open.png`,
			clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height + 300, 850) },
		});
	});

	test('toolbar-overflow-flow', async ({ page }) => {
		await page.setViewportSize({ width: 500, height: 900 });
		await page.waitForTimeout(500);
		// Inject CSS into shadow root to simulate flow overflow mode
		await page.evaluate(() => {
			const editor: HTMLElement | null = document.querySelector('notectl-editor');
			if (!editor?.shadowRoot) return;
			const toolbar: HTMLElement | null = editor.shadowRoot.querySelector('[role="toolbar"]');
			if (toolbar) toolbar.setAttribute('data-overflow', 'flow');
			const style: HTMLStyleElement = document.createElement('style');
			style.textContent = [
				'.notectl-toolbar-btn--overflow-hidden { display: flex !important; }',
				'.notectl-toolbar-separator--overflow-hidden { display: block !important; }',
				'.notectl-toolbar-overflow-btn { display: none !important; }',
			].join('\n');
			editor.shadowRoot.appendChild(style);
		});
		await page.waitForTimeout(300);
		await shot(page, 'toolbar-overflow-flow.png');
	});

	// ── Read-Only Checklist ──────────────────────────

	test('readonly-checklist', async ({ page }) => {
		const checklistContent: DocDef = {
			children: [
				heading(2, [txt('Sprint Tasks')]),
				listItem('checklist', [txt('Set up project repository')], { checked: true }),
				listItem('checklist', [txt('Write unit tests for core module')], { checked: true }),
				listItem('checklist', [txt('Implement API endpoints')], { checked: false }),
				listItem('checklist', [txt('Deploy to staging environment')], { checked: false }),
				para([txt('Click the checkboxes — they remain interactive in read-only mode.')]),
			],
		};
		await setEditorJSON(page, checklistContent);
		// Inject CSS into shadow root to hide toolbar (simulates readonly mode)
		await page.evaluate(() => {
			const editor: HTMLElement | null = document.querySelector('notectl-editor');
			if (!editor?.shadowRoot) return;
			const style: HTMLStyleElement = document.createElement('style');
			style.textContent = '[role="toolbar"] { display: none !important; }';
			editor.shadowRoot.appendChild(style);
		});
		await page.waitForTimeout(300);
		await shot(page, 'readonly-checklist.png');
	});
});
