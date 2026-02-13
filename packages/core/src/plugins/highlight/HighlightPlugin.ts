/**
 * HighlightPlugin: registers a highlight (background-color) mark with attrs,
 * toolbar button with a color picker popup, and removeHighlight command.
 */

import { isMarkOfType } from '../../model/AttrRegistry.js';
import { getBlockMarksAtOffset, hasMark } from '../../model/Document.js';
import { isCollapsed, isNodeSelection, selectionRange } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		highlight: { color: string };
	}
}

// --- Configuration ---

export interface HighlightConfig {
	/**
	 * Restricts the color picker to a specific set of hex colors.
	 * Each value must be a valid hex color code (`#RGB` or `#RRGGBB`).
	 * Duplicates are removed automatically (case-insensitive).
	 * When omitted, the full default palette is shown.
	 */
	readonly colors?: readonly string[];
	/** When true, a separator is rendered after the highlight toolbar item. */
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: HighlightConfig = {};

// --- Color Validation ---

const HEX_COLOR_PATTERN: RegExp = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function isValidHexColor(value: string): boolean {
	return HEX_COLOR_PATTERN.test(value);
}

/**
 * Validates, deduplicates, and normalizes the user-supplied color list.
 * Returns the default palette when no custom colors are provided.
 *
 * @throws {Error} if any value is not a valid hex color code.
 */
function resolveColors(colors: readonly string[] | undefined): readonly string[] {
	if (!colors || colors.length === 0) return HIGHLIGHT_PALETTE;

	const invalid: string[] = colors.filter((c) => !isValidHexColor(c));
	if (invalid.length > 0) {
		throw new Error(
			`HighlightPlugin: invalid hex color(s): ${invalid.join(', ')}. Expected format: #RGB or #RRGGBB.`,
		);
	}

	const seen: Set<string> = new Set();
	const unique: string[] = [];
	for (const color of colors) {
		const normalized: string = color.toLowerCase();
		if (!seen.has(normalized)) {
			seen.add(normalized);
			unique.push(normalized);
		}
	}
	return unique;
}

// --- Color Palette (Highlight-optimized: 10 columns x 5 rows) ---

const HIGHLIGHT_PALETTE: readonly string[] = [
	// Row 1 — Classic highlighter colors (bright, vivid)
	'#fff176',
	'#aed581',
	'#4dd0e1',
	'#64b5f6',
	'#ce93d8',
	'#f48fb1',
	'#ffab91',
	'#ff8a65',
	'#e6ee9c',
	'#80cbc4',

	// Row 2 — Light pastels
	'#fff9c4',
	'#dcedc8',
	'#e0f7fa',
	'#e3f2fd',
	'#f3e5f5',
	'#fce4ec',
	'#fff3e0',
	'#fbe9e7',
	'#f9fbe7',
	'#e0f2f1',

	// Row 3 — Medium pastels
	'#fff59d',
	'#c5e1a5',
	'#80deea',
	'#90caf9',
	'#e1bee7',
	'#f8bbd0',
	'#ffcc80',
	'#ffab91',
	'#e6ee9c',
	'#a5d6a7',

	// Row 4 — Bold pastels
	'#ffee58',
	'#9ccc65',
	'#26c6da',
	'#42a5f5',
	'#ab47bc',
	'#ec407a',
	'#ffa726',
	'#ff7043',
	'#d4e157',
	'#66bb6a',

	// Row 5 — Grays and neutral highlights
	'#ffffff',
	'#fafafa',
	'#f5f5f5',
	'#eeeeee',
	'#e0e0e0',
	'#bdbdbd',
	'#e8eaf6',
	'#efebe9',
	'#eceff1',
	'#fafafa',
];

// --- Plugin ---

export class HighlightPlugin implements Plugin {
	readonly id = 'highlight';
	readonly name = 'Highlight';
	readonly priority = 24;

	private readonly config: HighlightConfig;
	private readonly colors: readonly string[];

	constructor(config?: Partial<HighlightConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.colors = resolveColors(config?.colors);
	}

	init(context: PluginContext): void {
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerToolbarItem(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'highlight',
			rank: 4,
			attrs: {
				color: { default: '' },
			},
			toDOM(mark) {
				const span = document.createElement('span');
				const color = mark.attrs?.color ?? '';
				span.style.backgroundColor = color;
				return span;
			},
		});
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('removeHighlight', () => {
			const state = context.getState();
			return this.removeHighlight(context, state);
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		const pathD =
			'M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2z' + 'm-1.38 9L12 5.67 14.38 12H9.62z';
		const icon: string = [
			'<svg xmlns="http://www.w3.org/2000/svg"',
			' viewBox="0 0 24 24">',
			`<path d="${pathD}"/>`,
			'<rect x="3" y="17" width="18" height="6"',
			' rx="0.5" fill="#fff176"/>',
			'</svg>',
		].join('');

		context.registerToolbarItem({
			id: 'highlight',
			group: 'format',
			icon,
			label: 'Highlight',
			tooltip: 'Highlight Color',
			command: 'removeHighlight',
			priority: 46,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx) => {
				this.renderHighlightPopup(container, ctx);
			},
			isActive: (state) => this.isHighlightActive(state),
		});
	}

	// --- State Queries ---

	private isHighlightActive(state: EditorState): boolean {
		return this.getActiveColor(state) !== null;
	}

	private getActiveColor(state: EditorState): string | null {
		const sel = state.selection;
		if (isNodeSelection(sel)) return null;

		if (isCollapsed(sel)) {
			if (state.storedMarks) {
				const mark = state.storedMarks.find((m) => m.type === 'highlight');
				return mark && isMarkOfType(mark, 'highlight') ? (mark.attrs.color ?? null) : null;
			}
			const block = state.getBlock(sel.anchor.blockId);
			if (!block) return null;
			const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
			const mark = marks.find((m) => m.type === 'highlight');
			return mark && isMarkOfType(mark, 'highlight') ? (mark.attrs.color ?? null) : null;
		}

		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return null;
		const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
		const mark = marks.find((m) => m.type === 'highlight');
		return mark && isMarkOfType(mark, 'highlight') ? (mark.attrs.color ?? null) : null;
	}

	// --- Highlight Application ---

	private applyHighlight(context: PluginContext, state: EditorState, color: string): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		if (isCollapsed(sel)) {
			const anchorBlock = state.getBlock(sel.anchor.blockId);
			if (!anchorBlock) return false;
			const currentMarks =
				state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
			const withoutHighlight = currentMarks.filter((m) => m.type !== 'highlight');
			const newMarks = [...withoutHighlight, { type: markType('highlight'), attrs: { color } }];

			const tr = state
				.transaction('command')
				.setStoredMarks(newMarks, state.storedMarks)
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const builder = state.transaction('command');

		const fromIdx = blockOrder.indexOf(range.from.blockId);
		const toIdx = blockOrder.indexOf(range.to.blockId);

		const mark = { type: markType('highlight'), attrs: { color } };

		for (let i = fromIdx; i <= toIdx; i++) {
			const blockId = blockOrder[i];
			if (!blockId) continue;
			const block = state.getBlock(blockId);
			if (!block) continue;
			const blockLen = block.children.reduce(
				(sum, c) => sum + ('text' in c ? c.text.length : 0),
				0,
			);

			const from = i === fromIdx ? range.from.offset : 0;
			const to = i === toIdx ? range.to.offset : blockLen;

			if (from !== to) {
				builder.removeMark(blockId, from, to, {
					type: markType('highlight'),
				});
				builder.addMark(blockId, from, to, mark);
			}
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	private removeHighlight(context: PluginContext, state: EditorState): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		if (isCollapsed(sel)) {
			const anchorBlock = state.getBlock(sel.anchor.blockId);
			if (!anchorBlock) return false;
			const currentMarks =
				state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
			if (!hasMark(currentMarks, markType('highlight'))) return false;

			const newMarks = currentMarks.filter((m) => m.type !== 'highlight');
			const tr = state
				.transaction('command')
				.setStoredMarks(newMarks, state.storedMarks)
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const builder = state.transaction('command');

		const fromIdx = blockOrder.indexOf(range.from.blockId);
		const toIdx = blockOrder.indexOf(range.to.blockId);

		for (let i = fromIdx; i <= toIdx; i++) {
			const blockId = blockOrder[i];
			if (!blockId) continue;
			const block = state.getBlock(blockId);
			if (!block) continue;
			const blockLen = block.children.reduce(
				(sum, c) => sum + ('text' in c ? c.text.length : 0),
				0,
			);

			const from = i === fromIdx ? range.from.offset : 0;
			const to = i === toIdx ? range.to.offset : blockLen;

			if (from !== to) {
				builder.removeMark(blockId, from, to, {
					type: markType('highlight'),
				});
			}
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	// --- Popup Rendering ---

	private renderHighlightPopup(container: HTMLElement, context: PluginContext): void {
		container.classList.add('notectl-color-picker');

		const state = context.getState();
		const activeColor = this.getActiveColor(state);

		const defaultBtn = document.createElement('button');
		defaultBtn.type = 'button';
		defaultBtn.className = 'notectl-color-picker__default';
		defaultBtn.textContent = 'None';
		defaultBtn.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			context.executeCommand('removeHighlight');
		});
		container.appendChild(defaultBtn);

		const grid = document.createElement('div');
		grid.className = 'notectl-color-picker__grid';

		for (const color of this.colors) {
			const swatch = document.createElement('button');
			swatch.type = 'button';
			swatch.className = 'notectl-color-picker__swatch';
			if (activeColor && activeColor.toLowerCase() === color.toLowerCase()) {
				swatch.classList.add('notectl-color-picker__swatch--active');
			}
			swatch.style.backgroundColor = color;
			if (color === '#ffffff') {
				swatch.style.border = '1px solid #d0d0d0';
			}
			swatch.title = color;

			swatch.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.applyHighlight(context, context.getState(), color);
			});

			grid.appendChild(swatch);
		}

		container.appendChild(grid);
	}
}
