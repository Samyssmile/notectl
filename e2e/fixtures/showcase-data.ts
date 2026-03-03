/**
 * Shared showcase document definition and normalization utilities
 * used by both the vanilla and Angular cut/paste roundtrip E2E tests.
 */
import type { Page } from '@playwright/test';

// ── Types ───────────────────────────────────────────────────────

export type MarkDef = { type: string; attrs?: Record<string, unknown> };
export type TextDef = { type: 'text'; text: string; marks: MarkDef[] };
export type BlockDef = {
	id: string;
	type: string;
	attrs?: Record<string, unknown>;
	children: (TextDef | BlockDef)[];
};
export type DocDef = { children: BlockDef[] };

export type JsonChild = {
	type: string;
	id?: string;
	children?: JsonChild[];
	attrs?: Record<string, unknown>;
	text?: string;
	marks?: { type: string; attrs?: Record<string, unknown> }[];
};

// ── Document Builder Helpers ────────────────────────────────────

function createDocBuilders(): {
	txt: (t: string, ...marks: MarkDef[]) => TextDef;
	para: (children: TextDef[], attrs?: Record<string, unknown>) => BlockDef;
	heading: (level: number, children: TextDef[]) => BlockDef;
	listItem: (
		listType: 'bullet' | 'ordered' | 'checklist',
		children: TextDef[],
		opts?: { indent?: number; checked?: boolean },
	) => BlockDef;
	blockquote: (children: TextDef[]) => BlockDef;
	codeBlock: (code: string, language: string) => BlockDef;
	hr: () => BlockDef;
	table: (rows: TextDef[][][]) => BlockDef;
} {
	let counter = 0;
	const uid = (): string => `sc-${++counter}`;

	return {
		txt: (t: string, ...marks: MarkDef[]): TextDef => ({ type: 'text', text: t, marks }),
		para: (children: TextDef[], attrs?: Record<string, unknown>): BlockDef => ({
			id: uid(),
			type: 'paragraph',
			...(attrs ? { attrs } : {}),
			children,
		}),
		heading: (level: number, children: TextDef[]): BlockDef => ({
			id: uid(),
			type: 'heading',
			attrs: { level },
			children,
		}),
		listItem: (
			listType: 'bullet' | 'ordered' | 'checklist',
			children: TextDef[],
			opts: { indent?: number; checked?: boolean } = {},
		): BlockDef => ({
			id: uid(),
			type: 'list_item',
			attrs: { listType, indent: opts.indent ?? 0, checked: opts.checked ?? false },
			children,
		}),
		blockquote: (children: TextDef[]): BlockDef => ({ id: uid(), type: 'blockquote', children }),
		codeBlock: (code: string, language: string): BlockDef => ({
			id: uid(),
			type: 'code_block',
			attrs: { language },
			children: [{ type: 'text', text: code, marks: [] }],
		}),
		hr: (): BlockDef => ({
			id: uid(),
			type: 'horizontal_rule',
			children: [{ type: 'text', text: '', marks: [] }],
		}),
		table: (rows: TextDef[][][]): BlockDef => ({
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
		}),
	};
}

// Mark helpers
const bold: MarkDef = { type: 'bold' };
const italic: MarkDef = { type: 'italic' };
const underline: MarkDef = { type: 'underline' };
const strike: MarkDef = { type: 'strikethrough' };
const superscript: MarkDef = { type: 'superscript' };
const subscript: MarkDef = { type: 'subscript' };

function textColor(color: string): MarkDef {
	return { type: 'textColor', attrs: { color } };
}

function highlight(color: string): MarkDef {
	return { type: 'highlight', attrs: { color } };
}

function link(href: string): MarkDef {
	return { type: 'link', attrs: { href } };
}

function font(family: string): MarkDef {
	return { type: 'font', attrs: { family } };
}

function fontSize(size: string): MarkDef {
	return { type: 'fontSize', attrs: { size } };
}

// ── Showcase Document ───────────────────────────────────────────

export function buildShowcaseDocument(): DocDef {
	const { txt, para, heading, listItem, blockquote, codeBlock, hr, table } = createDocBuilders();

	return {
		children: [
			heading(1, [txt('Showcase Document')]),

			// Paragraph exercising every inline mark type
			para([
				txt('This has '),
				txt('bold', bold),
				txt(', '),
				txt('italic', italic),
				txt(', '),
				txt('underlined', underline),
				txt(', '),
				txt('struck', strike),
				txt(', '),
				txt('super', superscript),
				txt(', '),
				txt('sub', subscript),
				txt(', '),
				txt('linked', link('https://example.com')),
				txt(', '),
				txt('colored', textColor('#4285f4')),
				txt(', '),
				txt('highlighted', highlight('#fff176')),
				txt(', '),
				txt('custom font', font("'Fira Code', monospace")),
				txt(', and '),
				txt('sized text', fontSize('24px')),
				txt('.'),
			]),

			heading(2, [txt('Code Example')]),
			codeBlock("const greeting: string = 'Hello';\nconsole.log(greeting);", 'typescript'),

			heading(2, [txt('Blockquote')]),
			blockquote([txt('A wise observation in italic.', italic)]),

			heading(2, [txt('Lists')]),
			listItem('bullet', [txt('Bullet item one')]),
			listItem('bullet', [txt('Bullet item two')]),
			listItem('ordered', [txt('Ordered item one')]),
			listItem('ordered', [txt('Ordered item two')]),
			listItem('checklist', [txt('Checked task')], { checked: true }),
			listItem('checklist', [txt('Unchecked task')], { checked: false }),

			heading(2, [txt('Table')]),
			table([
				[[txt('Feature', bold)], [txt('Status', bold)], [txt('Owner', bold)]],
				[[txt('Authentication')], [txt('Done', textColor('#34a853'))], [txt('Alice')]],
				[[txt('Dashboard')], [txt('In Progress', textColor('#4285f4'))], [txt('Bob')]],
			]),

			heading(2, [txt('Layout')]),
			para([txt('Center-aligned paragraph.')], { align: 'center' }),
			para([txt('Right-aligned paragraph.')], { align: 'end' }),
			para(
				[txt('Justified paragraph with enough text to demonstrate the alignment effect clearly.')],
				{ align: 'justify' },
			),

			hr(),

			heading(3, [txt('RTL Text')]),
			para([txt('مرحبا بالعالم — Hello World in Arabic.')], { dir: 'rtl' }),
		],
	};
}

// ── Normalization ───────────────────────────────────────────────

/**
 * Recursively normalizes a JSON snapshot for comparison.
 *
 * Only accounts for unavoidable browser-level transformations:
 * - **IDs regenerated**: Block IDs change on paste → strip `id` fields.
 * - **Hex → rgb()**: Browser serializes hex colors as `rgb()` in inline styles
 *   → convert hex to `rgb()` in the "before" snapshot.
 *
 * All other differences (table cell wrapping, lost attributes, etc.) are
 * real bugs and must be surfaced by the test, not normalized away.
 */
export function normalize(obj: unknown): unknown {
	if (Array.isArray(obj)) {
		return obj.map((item) => normalize(item));
	}
	if (obj !== null && typeof obj === 'object') {
		const record = obj as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(record)) {
			if (key === 'id') continue;

			// Normalize color attrs: hex → rgb (browser clipboard behavior)
			if (key === 'color' && typeof value === 'string' && value.startsWith('#')) {
				result[key] = hexToRgb(value);
				continue;
			}

			result[key] = normalize(value);
		}
		return result;
	}
	return obj;
}

/** Converts a 3- or 6-digit hex color string to an `rgb(r, g, b)` string. */
function hexToRgb(hex: string): string {
	const h: string = hex.replace('#', '');
	const full: string = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	const r: number = Number.parseInt(full.substring(0, 2), 16);
	const g: number = Number.parseInt(full.substring(2, 4), 16);
	const b: number = Number.parseInt(full.substring(4, 6), 16);
	return `rgb(${r}, ${g}, ${b})`;
}

// ── Shared Roundtrip Helper ─────────────────────────────────────

/** Minimal editor interface shared between EditorPage and AngularEditorPage. */
interface ShowcaseEditor {
	setJSON(doc: unknown): Promise<void>;
	getJSON(): Promise<{ children: JsonChild[] }>;
	focus(): Promise<void>;
}

export async function loadAndRoundtrip(
	editor: ShowcaseEditor,
	page: Page,
): Promise<{ beforeJson: { children: JsonChild[] }; afterJson: { children: JsonChild[] } }> {
	const showcase: DocDef = buildShowcaseDocument();

	await editor.setJSON(showcase);
	await page.waitForTimeout(500);

	const beforeJson: { children: JsonChild[] } = await editor.getJSON();

	await editor.focus();
	await page.keyboard.press('Control+a');
	await page.keyboard.press('Control+x');
	await page.waitForTimeout(200);
	await page.keyboard.press('Control+v');
	await page.waitForTimeout(300);

	const afterJson: { children: JsonChild[] } = await editor.getJSON();
	return { beforeJson, afterJson };
}
