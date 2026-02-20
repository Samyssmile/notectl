/**
 * HeadingPlugin: registers Title, Subtitle, and H1–H6 heading block types
 * with NodeSpec, toggle commands, keyboard shortcuts, input rules, and a
 * combobox-style toolbar dropdown that reflects the current block type.
 */

import type { BlockNode, Mark } from '../../model/Document.js';
import {
	generateBlockId,
	getBlockLength,
	getBlockText,
	getInlineChildren,
	isTextNode,
} from '../../model/Document.js';
import { createBlockElement } from '../../model/NodeSpec.js';
import { createCollapsedSelection, isCollapsed, isNodeSelection } from '../../model/Selection.js';
import { type NodeTypeName, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction, TransactionBuilder } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import type { BlockAlignment } from '../alignment/AlignmentPlugin.js';
import { ToolbarServiceKey } from '../toolbar/ToolbarPlugin.js';
import type { PickerEntryStyle } from './BlockTypePickerEntry.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		heading: { level: HeadingLevel; align?: BlockAlignment };
		title: { align?: BlockAlignment };
		subtitle: { align?: BlockAlignment };
	}
}

// --- Configuration ---

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingConfig {
	/** Which heading levels to enable. Defaults to [1, 2, 3, 4, 5, 6]. */
	readonly levels: readonly HeadingLevel[];
	/** When true, a separator is rendered after the heading toolbar item. */
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: HeadingConfig = {
	levels: [1, 2, 3, 4, 5, 6],
};

// --- Heading Tag Mapping ---

const HEADING_TAGS: Record<HeadingLevel, string> = {
	1: 'h1',
	2: 'h2',
	3: 'h3',
	4: 'h4',
	5: 'h5',
	6: 'h6',
};

// --- Display Labels ---

const HEADING_LABELS: Record<HeadingLevel, string> = {
	1: 'Heading 1',
	2: 'Heading 2',
	3: 'Heading 3',
	4: 'Heading 4',
	5: 'Heading 5',
	6: 'Heading 6',
};

const TITLE_LABEL = 'Title';
const SUBTITLE_LABEL = 'Subtitle';
const PARAGRAPH_LABEL = 'Paragraph';

// --- Plugin ---

export class HeadingPlugin implements Plugin {
	readonly id = 'heading';
	readonly name = 'Heading';
	readonly priority = 30;

	private readonly config: HeadingConfig;
	private context: PluginContext | null = null;
	private comboLabel: HTMLSpanElement | null = null;

	constructor(config?: Partial<HeadingConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.context = context;
		this.registerNodeSpecs(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerInputRules(context);
		this.registerPickerEntries(context);
		this.registerToolbarItem(context);
	}

	destroy(): void {
		this.context = null;
		this.comboLabel = null;
	}

	onStateChange(_oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		this.updateComboLabel(newState);
	}

	private registerNodeSpecs(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'title',
			group: 'block',
			content: { allow: ['text'] },
			excludeMarks: ['fontSize'],
			toDOM(node) {
				const el = createBlockElement('h1', node.id);
				el.classList.add('notectl-title');
				return el;
			},
			toHTML(_node, content) {
				return `<h1>${content || '<br>'}</h1>`;
			},
			sanitize: { tags: ['h1'] },
		});

		context.registerNodeSpec({
			type: 'subtitle',
			group: 'block',
			content: { allow: ['text'] },
			excludeMarks: ['fontSize'],
			toDOM(node) {
				const el = createBlockElement('h2', node.id);
				el.classList.add('notectl-subtitle');
				return el;
			},
			toHTML(_node, content) {
				return `<h2>${content || '<br>'}</h2>`;
			},
			sanitize: { tags: ['h2'] },
		});

		context.registerNodeSpec({
			type: 'heading',
			group: 'block',
			content: { allow: ['text'] },
			excludeMarks: ['fontSize'],
			attrs: {
				level: { default: 1 },
			},
			toDOM(node) {
				const level = node.attrs?.level ?? 1;
				const tag = HEADING_TAGS[level] ?? 'h1';
				return createBlockElement(tag, node.id);
			},
			toHTML(node, content) {
				const level = (node.attrs?.level ?? 1) as HeadingLevel;
				const tag: string = HEADING_TAGS[level] ?? 'h1';
				return `<${tag}>${content || '<br>'}</${tag}>`;
			},
			parseHTML: [
				{ tag: 'h1', getAttrs: () => ({ level: 1 }) },
				{ tag: 'h2', getAttrs: () => ({ level: 2 }) },
				{ tag: 'h3', getAttrs: () => ({ level: 3 }) },
				{ tag: 'h4', getAttrs: () => ({ level: 4 }) },
				{ tag: 'h5', getAttrs: () => ({ level: 5 }) },
				{ tag: 'h6', getAttrs: () => ({ level: 6 }) },
			],
			sanitize: { tags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
		});
	}

	private registerCommands(context: PluginContext): void {
		// Title / Subtitle
		context.registerCommand('setTitle', () => {
			return this.toggleSpecialBlock(context, 'title');
		});

		context.registerCommand('setSubtitle', () => {
			return this.toggleSpecialBlock(context, 'subtitle');
		});

		// Heading levels
		for (const level of this.config.levels) {
			context.registerCommand(`setHeading${level}`, () => {
				return this.toggleHeading(context, level);
			});
		}

		// Generic command that toggles back to paragraph
		context.registerCommand('toggleHeading', () => {
			return this.toggleHeading(context, 1);
		});

		// Set paragraph (reset heading)
		context.registerCommand('setParagraph', () => {
			return this.setBlockType(context, nodeType('paragraph'));
		});
	}

	private registerKeymaps(context: PluginContext): void {
		const keymap: Record<string, () => boolean> = {
			Enter: () => this.handleEnter(context),
		};

		for (const level of this.config.levels) {
			if (level <= 6) {
				keymap[`Mod-Shift-${level}`] = () => context.executeCommand(`setHeading${level}`);
			}
		}

		context.registerKeymap(keymap);
	}

	private registerInputRules(context: PluginContext): void {
		for (const level of this.config.levels) {
			const hashes = '#'.repeat(level);
			const pattern = new RegExp(`^${hashes} $`);

			context.registerInputRule({
				pattern,
				handler(state, _match, start, _end) {
					const sel = state.selection;
					if (isNodeSelection(sel)) return null;
					if (!isCollapsed(sel)) return null;

					const block = state.getBlock(sel.anchor.blockId);
					if (!block || block.type !== 'paragraph') return null;

					return state
						.transaction('input')
						.deleteTextAt(sel.anchor.blockId, start, start + level + 1)
						.setBlockType(sel.anchor.blockId, nodeType('heading'), { level })
						.setSelection(createCollapsedSelection(sel.anchor.blockId, 0))
						.build();
				},
			});
		}
	}

	private registerPickerEntries(context: PluginContext): void {
		context.registerBlockTypePickerEntry({
			id: 'paragraph',
			label: PARAGRAPH_LABEL,
			command: 'setParagraph',
			priority: 10,
			isActive: (state) => {
				if (isNodeSelection(state.selection)) return false;
				const block = state.getBlock(state.selection.anchor.blockId);
				return block?.type === 'paragraph';
			},
		});

		context.registerBlockTypePickerEntry({
			id: 'title',
			label: TITLE_LABEL,
			command: 'setTitle',
			priority: 20,
			style: { fontSize: '1.6em', fontWeight: '700' },
			isActive: (state) => {
				if (isNodeSelection(state.selection)) return false;
				const block = state.getBlock(state.selection.anchor.blockId);
				return block?.type === 'title';
			},
		});

		context.registerBlockTypePickerEntry({
			id: 'subtitle',
			label: SUBTITLE_LABEL,
			command: 'setSubtitle',
			priority: 30,
			style: { fontSize: '1.3em', fontWeight: '500' },
			isActive: (state) => {
				if (isNodeSelection(state.selection)) return false;
				const block = state.getBlock(state.selection.anchor.blockId);
				return block?.type === 'subtitle';
			},
		});

		for (const level of this.config.levels) {
			context.registerBlockTypePickerEntry({
				id: `heading-${level}`,
				label: HEADING_LABELS[level],
				command: `setHeading${level}`,
				priority: 100 + level,
				style: { fontSize: `${1.4 - level * 0.1}em`, fontWeight: '600' },
				isActive: (state) => {
					if (isNodeSelection(state.selection)) return false;
					const block = state.getBlock(state.selection.anchor.blockId);
					return block?.type === 'heading' && block.attrs?.level === level;
				},
			});
		}
	}

	private registerToolbarItem(context: PluginContext): void {
		const icon: string = `<span class="notectl-heading-select__label" data-heading-label>${PARAGRAPH_LABEL}</span><span class="notectl-heading-select__arrow">\u25BE</span>`;

		context.registerToolbarItem({
			id: 'heading',
			group: 'block',
			icon,
			label: 'Block Type',
			tooltip: 'Block Type',
			command: 'setParagraph',
			priority: 50,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx) => {
				this.renderHeadingPopup(container, ctx);
			},
			isActive: (state) => {
				const entries = context.getSchemaRegistry().getBlockTypePickerEntries();
				return entries.some((entry) => entry.id !== 'paragraph' && entry.isActive(state));
			},
		});
	}

	// --- Combo Label ---

	private updateComboLabel(state: EditorState): void {
		if (!this.comboLabel) {
			const container: HTMLElement | undefined = this.context?.getPluginContainer('top');
			if (!container) return;
			this.comboLabel = container.querySelector<HTMLSpanElement>('[data-heading-label]') ?? null;
			if (!this.comboLabel) return;
		}

		this.comboLabel.textContent = this.getActiveLabel(state);
	}

	private getActiveLabel(state: EditorState): string {
		if (isNodeSelection(state.selection)) return PARAGRAPH_LABEL;
		const entries = this.context?.getSchemaRegistry().getBlockTypePickerEntries() ?? [];
		for (const entry of entries) {
			if (entry.isActive(state)) return entry.label;
		}
		return PARAGRAPH_LABEL;
	}

	// --- Custom Popup ---

	private dismissPopup(): void {
		const toolbar = this.context?.getService(ToolbarServiceKey);
		toolbar?.closePopup();
	}

	private renderHeadingPopup(container: HTMLElement, context: PluginContext): void {
		container.classList.add('notectl-heading-picker');

		const state: EditorState = context.getState();
		if (isNodeSelection(state.selection)) return;

		const list: HTMLDivElement = document.createElement('div');
		list.className = 'notectl-heading-picker__list';
		list.setAttribute('role', 'listbox');
		list.setAttribute('aria-label', 'Block types');

		const entries = context.getSchemaRegistry().getBlockTypePickerEntries();
		for (const entry of entries) {
			const active: boolean = entry.isActive(state);
			list.appendChild(
				this.createPickerItem(
					entry.label,
					active,
					(e: MouseEvent) => {
						e.preventDefault();
						e.stopPropagation();
						context.executeCommand(entry.command);
						this.dismissPopup();
					},
					entry.style,
				),
			);
		}

		container.appendChild(list);
	}

	private createPickerItem(
		label: string,
		isActive: boolean,
		handler: (e: MouseEvent) => void,
		style?: PickerEntryStyle,
	): HTMLButtonElement {
		const item: HTMLButtonElement = document.createElement('button');
		item.type = 'button';
		item.className = 'notectl-heading-picker__item';
		item.setAttribute('role', 'option');
		item.setAttribute('aria-selected', String(isActive));

		if (isActive) {
			item.classList.add('notectl-heading-picker__item--active');
		}

		const check: HTMLSpanElement = document.createElement('span');
		check.className = 'notectl-heading-picker__check';
		check.textContent = isActive ? '\u2713' : '';
		item.appendChild(check);

		const labelSpan: HTMLSpanElement = document.createElement('span');
		labelSpan.className = 'notectl-heading-picker__label';
		labelSpan.textContent = label;
		if (style) {
			labelSpan.style.fontSize = style.fontSize;
			labelSpan.style.fontWeight = style.fontWeight;
		}
		item.appendChild(labelSpan);

		item.addEventListener('mousedown', handler);
		return item;
	}

	// --- Enter Handling ---

	private static readonly HEADING_TYPES: ReadonlySet<string> = new Set([
		'heading',
		'title',
		'subtitle',
	]);

	/**
	 * Handles Enter inside a heading block.
	 * Empty heading → convert to paragraph.
	 * Cursor at end → split and convert new block to paragraph.
	 * Cursor in middle → normal split (both stay heading).
	 */
	private handleEnter(context: PluginContext): boolean {
		const state = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		if (!isCollapsed(sel)) return false;

		const block = state.getBlock(sel.anchor.blockId);
		if (!block || !HeadingPlugin.HEADING_TYPES.has(block.type)) return false;

		const text: string = getBlockText(block);

		if (text === '') {
			// Empty heading → convert to paragraph
			const tr = state
				.transaction('input')
				.setBlockType(sel.anchor.blockId, nodeType('paragraph'))
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		const blockLength: number = getBlockLength(block);

		if (sel.anchor.offset >= blockLength) {
			// Cursor at end → split and convert new block to paragraph
			const newBlockId = generateBlockId();
			const tr = state
				.transaction('input')
				.splitBlock(sel.anchor.blockId, sel.anchor.offset, newBlockId)
				.setBlockType(newBlockId, nodeType('paragraph'))
				.setSelection(createCollapsedSelection(newBlockId, 0))
				.build();
			context.dispatch(tr);
			return true;
		}

		// Cursor in middle → default split (both parts stay heading)
		return false;
	}

	/**
	 * Toggles between a special block type (title/subtitle) and paragraph.
	 * If the block is already that type, resets to paragraph.
	 */
	private toggleSpecialBlock(context: PluginContext, type: string): boolean {
		const state = context.getState();
		if (isNodeSelection(state.selection)) return false;
		const block = state.getBlock(state.selection.anchor.blockId);
		if (!block) return false;

		if (block.type === type) {
			return this.setBlockType(context, nodeType('paragraph'));
		}

		return this.setBlockType(context, nodeType(type) as NodeTypeName);
	}

	/**
	 * Toggles between heading (at given level) and paragraph.
	 * If the block is already a heading at the same level, resets to paragraph.
	 */
	private toggleHeading(context: PluginContext, level: HeadingLevel): boolean {
		const state = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return false;

		if (block.type === 'heading' && block.attrs?.level === level) {
			return this.setBlockType(context, nodeType('paragraph'));
		}

		return this.setBlockType(context, nodeType('heading'), { level });
	}

	private setBlockType(
		context: PluginContext,
		type: NodeTypeName,
		attrs?: Record<string, string | number | boolean>,
	): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block) return false;

		const builder = state.transaction('command');

		const spec = context.getSchemaRegistry().getNodeSpec(type);
		if (spec?.excludeMarks && spec.excludeMarks.length > 0) {
			this.stripExcludedMarks(builder, block, spec.excludeMarks);
			this.clearExcludedStoredMarks(builder, state, spec.excludeMarks);
		}

		const tr = builder.setBlockType(sel.anchor.blockId, type, attrs).setSelection(sel).build();

		context.dispatch(tr);
		return true;
	}

	/**
	 * Adds removeMark steps for each excluded mark type found
	 * on the block's inline text content.
	 */
	private stripExcludedMarks(
		builder: TransactionBuilder,
		block: BlockNode,
		excludeMarks: readonly string[],
	): void {
		const blockLength: number = getBlockLength(block);
		if (blockLength === 0) return;

		const excludeSet: Set<string> = new Set(excludeMarks);
		const inlineChildren = getInlineChildren(block);
		let offset = 0;

		for (const child of inlineChildren) {
			if (isTextNode(child)) {
				if (child.text.length > 0) {
					for (const mark of child.marks) {
						if (excludeSet.has(mark.type)) {
							builder.removeMark(block.id, offset, offset + child.text.length, mark);
						}
					}
				}
				offset += child.text.length;
			} else {
				offset += 1;
			}
		}
	}

	/**
	 * Clears excluded mark types from stored marks so that
	 * subsequent typing does not reintroduce them.
	 */
	private clearExcludedStoredMarks(
		builder: TransactionBuilder,
		state: EditorState,
		excludeMarks: readonly string[],
	): void {
		if (!state.storedMarks) return;

		const excludeSet: Set<string> = new Set(excludeMarks);
		const filtered: readonly Mark[] = state.storedMarks.filter(
			(m: Mark) => !excludeSet.has(m.type),
		);

		if (filtered.length !== state.storedMarks.length) {
			builder.setStoredMarks(filtered.length > 0 ? filtered : null, state.storedMarks);
		}
	}
}
