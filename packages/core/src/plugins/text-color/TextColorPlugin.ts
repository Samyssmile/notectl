/**
 * TextColorPlugin: registers a text color mark with attrs,
 * toolbar button with a color picker popup, and removeTextColor command.
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
		textColor: { color: string };
	}
}

// --- Configuration ---

export interface TextColorConfig {
	/**
	 * Restricts the color picker to a specific set of hex colors.
	 * Each value must be a valid hex color code (`#RGB` or `#RRGGBB`).
	 * Duplicates are removed automatically (case-insensitive).
	 * When omitted, the full default palette is shown.
	 */
	readonly colors?: readonly string[];
	/** When true, a separator is rendered after the textColor toolbar item. */
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: TextColorConfig = {};

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
	if (!colors || colors.length === 0) return COLOR_PALETTE;

	const invalid: string[] = colors.filter((c) => !isValidHexColor(c));
	if (invalid.length > 0) {
		throw new Error(
			`TextColorPlugin: invalid hex color(s): ${invalid.join(', ')}. Expected format: #RGB or #RRGGBB.`,
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

// --- Color Palette (Google Docs style: 10 columns x 7 rows) ---

const COLOR_PALETTE: readonly string[] = [
	// Row 1 — dark
	'#000000',
	'#434343',
	'#666666',
	'#999999',
	'#b7b7b7',
	'#cccccc',
	'#d9d9d9',
	'#efefef',
	'#f3f3f3',
	'#ffffff',
	// Row 2 — vivid
	'#980000',
	'#ff0000',
	'#ff9900',
	'#ffff00',
	'#00ff00',
	'#00ffff',
	'#4a86e8',
	'#0000ff',
	'#9900ff',
	'#ff00ff',
	// Row 3 — light 3
	'#e6b8af',
	'#f4cccc',
	'#fce5cd',
	'#fff2cc',
	'#d9ead3',
	'#d0e0e3',
	'#c9daf8',
	'#cfe2f3',
	'#d9d2e9',
	'#ead1dc',
	// Row 4 — light 2
	'#dd7e6b',
	'#ea9999',
	'#f9cb9c',
	'#ffe599',
	'#b6d7a8',
	'#a2c4c9',
	'#a4c2f4',
	'#9fc5e8',
	'#b4a7d6',
	'#d5a6bd',
	// Row 5 — light 1
	'#cc4125',
	'#e06666',
	'#f6b26b',
	'#ffd966',
	'#93c47d',
	'#76a5af',
	'#6d9eeb',
	'#6fa8dc',
	'#8e7cc3',
	'#c27ba0',
	// Row 6 — dark 1
	'#a61c00',
	'#cc0000',
	'#e69138',
	'#f1c232',
	'#6aa84f',
	'#45818e',
	'#3c78d8',
	'#3d85c6',
	'#674ea7',
	'#a64d79',
	// Row 7 — dark 2
	'#85200c',
	'#990000',
	'#b45f06',
	'#bf9000',
	'#38761d',
	'#134f5c',
	'#1155cc',
	'#0b5394',
	'#351c75',
	'#741b47',
];

// --- Plugin ---

export class TextColorPlugin implements Plugin {
	readonly id = 'textColor';
	readonly name = 'Text Color';
	readonly priority = 23;

	private readonly config: TextColorConfig;
	private readonly colors: readonly string[];

	constructor(config?: Partial<TextColorConfig>) {
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
			type: 'textColor',
			rank: 5,
			attrs: {
				color: { default: '' },
			},
			toDOM(mark) {
				const span = document.createElement('span');
				const color = mark.attrs?.color ?? '';
				span.style.color = color;
				return span;
			},
			toHTMLString: (mark, content) => {
				const color: string = String(mark.attrs?.color ?? '');
				return `<span style="color: ${color}">${content}</span>`;
			},
			parseHTML: [
				{
					tag: 'span',
					getAttrs: (el) => {
						const color: string = el.style.color;
						if (!color) return false;
						return { color };
					},
				},
			],
			sanitize: { tags: ['span'] },
		});
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('removeTextColor', () => {
			const state = context.getState();
			return this.removeColor(context, state);
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		const pathD =
			'M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2z' + 'm-1.38 9L12 5.67 14.38 12H9.62z';
		const icon: string = [
			'<svg xmlns="http://www.w3.org/2000/svg"',
			' viewBox="0 0 24 24">',
			`<path d="${pathD}"/>`,
			'<rect x="3" y="19.5" width="18" height="3"',
			' rx="0.5" fill="#e53935"/>',
			'</svg>',
		].join('');

		context.registerToolbarItem({
			id: 'textColor',
			group: 'format',
			icon,
			label: 'Text Color',
			tooltip: 'Text Color',
			command: 'removeTextColor',
			priority: 45,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx) => {
				this.renderColorPopup(container, ctx);
			},
			isActive: (state) => this.isTextColorActive(state),
		});
	}

	// --- State Queries ---

	private isTextColorActive(state: EditorState): boolean {
		return this.getActiveColor(state) !== null;
	}

	private getActiveColor(state: EditorState): string | null {
		const sel = state.selection;
		if (isNodeSelection(sel)) return null;

		if (isCollapsed(sel)) {
			if (state.storedMarks) {
				const mark = state.storedMarks.find((m) => m.type === 'textColor');
				return mark && isMarkOfType(mark, 'textColor') ? (mark.attrs.color ?? null) : null;
			}
			const block = state.getBlock(sel.anchor.blockId);
			if (!block) return null;
			const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
			const mark = marks.find((m) => m.type === 'textColor');
			return mark && isMarkOfType(mark, 'textColor') ? (mark.attrs.color ?? null) : null;
		}

		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return null;
		const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
		const mark = marks.find((m) => m.type === 'textColor');
		return mark && isMarkOfType(mark, 'textColor') ? (mark.attrs.color ?? null) : null;
	}

	// --- Color Application ---

	private applyColor(context: PluginContext, state: EditorState, color: string): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		if (isCollapsed(sel)) {
			// Set stored marks with the new color
			const anchorBlock = state.getBlock(sel.anchor.blockId);
			if (!anchorBlock) return false;
			const currentMarks =
				state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
			const withoutColor = currentMarks.filter((m) => m.type !== 'textColor');
			const newMarks = [...withoutColor, { type: markType('textColor'), attrs: { color } }];

			const tr = state
				.transaction('command')
				.setStoredMarks(newMarks, state.storedMarks)
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		// Range selection: remove existing textColor, then add new one
		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const builder = state.transaction('command');

		const fromIdx = blockOrder.indexOf(range.from.blockId);
		const toIdx = blockOrder.indexOf(range.to.blockId);

		const mark = { type: markType('textColor'), attrs: { color } };

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
				// Remove existing textColor first, then add new one
				builder.removeMark(blockId, from, to, { type: markType('textColor') });
				builder.addMark(blockId, from, to, mark);
			}
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	private removeColor(context: PluginContext, state: EditorState): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		if (isCollapsed(sel)) {
			// Remove textColor from stored marks
			const anchorBlock = state.getBlock(sel.anchor.blockId);
			if (!anchorBlock) return false;
			const currentMarks =
				state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
			if (!hasMark(currentMarks, markType('textColor'))) return false;

			const newMarks = currentMarks.filter((m) => m.type !== 'textColor');
			const tr = state
				.transaction('command')
				.setStoredMarks(newMarks, state.storedMarks)
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		// Range selection: remove textColor from range
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
				builder.removeMark(blockId, from, to, { type: markType('textColor') });
			}
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	// --- Popup Rendering ---

	private renderColorPopup(container: HTMLElement, context: PluginContext): void {
		container.classList.add('notectl-color-picker');

		const state = context.getState();
		const activeColor = this.getActiveColor(state);

		// "Default" button to remove color
		const defaultBtn = document.createElement('button');
		defaultBtn.type = 'button';
		defaultBtn.className = 'notectl-color-picker__default';
		defaultBtn.textContent = 'Default';
		defaultBtn.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			context.executeCommand('removeTextColor');
		});
		container.appendChild(defaultBtn);

		// Color grid
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
			swatch.setAttribute('aria-label', `Text color ${color}`);

			swatch.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.applyColor(context, context.getState(), color);
			});

			grid.appendChild(swatch);
		}

		container.appendChild(grid);
	}
}
