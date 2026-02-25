/**
 * ListPlugin: registers ordered, unordered, and checklist block types
 * with NodeSpecs, toggle commands, indent/outdent (Tab/Shift-Tab),
 * input rules, and toolbar buttons.
 *
 * List items are modeled as flat blocks with a `listType` and `indent` attribute,
 * allowing simple nesting representation without deep tree structures.
 */

import { LIST_CSS, LIST_MARKER_WIDTH } from '../../editor/styles/list.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import { isNodeOfType } from '../../model/AttrRegistry.js';
import { generateBlockId, getBlockText } from '../../model/Document.js';
import { createBlockElement } from '../../model/NodeSpec.js';
import { createCollapsedSelection, isCollapsed, isNodeSelection } from '../../model/Selection.js';
import { type BlockId, blockId, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { LIST_LOCALES, type ListLocale } from './ListLocale.js';

// --- Attribute Registry Augmentation ---

export type ListType = 'bullet' | 'ordered' | 'checklist';

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		list_item: { listType: ListType; indent: number; checked: boolean };
	}
}

// --- Configuration ---

export interface ListConfig {
	/** Which list types to enable. Defaults to all. */
	readonly types: readonly ListType[];
	/** Maximum indent depth. Defaults to 4. */
	readonly maxIndent: number;
	/** When true, a separator is rendered after the last list toolbar item. */
	readonly separatorAfter?: boolean;
	/**
	 * When true, checklist checkboxes remain interactive even in read-only mode.
	 * Defaults to false (checkboxes are fully read-only).
	 */
	readonly interactiveCheckboxes?: boolean;
	readonly locale?: ListLocale;
}

const DEFAULT_CONFIG: ListConfig = {
	types: ['bullet', 'ordered', 'checklist'],
	maxIndent: 4,
};

// --- List Type Metadata ---

interface ListTypeDefinition {
	readonly type: ListType;
	readonly label: string;
	readonly icon: string;
	readonly inputPattern: RegExp;
	readonly inputPrefix: string;
}

const BULLET_LIST_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>';
const NUMBERED_LIST_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>';
const CHECKLIST_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11L2 7.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 19z"/></svg>';

const LIST_TYPE_DEFINITIONS: readonly ListTypeDefinition[] = [
	{
		type: 'bullet',
		label: 'Bullet List',
		icon: BULLET_LIST_ICON,
		inputPattern: /^[-*] $/,
		inputPrefix: '- ',
	},
	{
		type: 'ordered',
		label: 'Numbered List',
		icon: NUMBERED_LIST_ICON,
		inputPattern: /^\d+\. $/,
		inputPrefix: '1. ',
	},
	{
		type: 'checklist',
		label: 'Checklist',
		icon: CHECKLIST_ICON,
		inputPattern: /^\[[ x]] $/,
		inputPrefix: '[ ] ',
	},
];

// --- Plugin ---

export class ListPlugin implements Plugin {
	readonly id = 'list';
	readonly name = 'List';
	readonly priority = 35;

	private readonly config: ListConfig;
	private locale!: ListLocale;
	private context: PluginContext | null = null;
	private checkboxClickHandler: ((e: MouseEvent) => void) | null = null;

	constructor(config?: Partial<ListConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.context = context;
		this.locale = resolvePluginLocale(LIST_LOCALES, context, this.config.locale);
		context.registerStyleSheet(LIST_CSS);
		this.registerNodeSpec(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerInputRules(context);
		this.registerToolbarItems(context);
		this.registerCheckboxClickHandler(context);
	}

	destroy(): void {
		if (this.checkboxClickHandler && this.context) {
			const container: HTMLElement = this.context.getContainer();
			container.removeEventListener('mousedown', this.checkboxClickHandler);
		}
		this.checkboxClickHandler = null;
		this.context = null;
	}

	private registerNodeSpec(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'list_item',
			group: 'block',
			content: { allow: ['text'] },
			attrs: {
				listType: { default: 'bullet' },
				indent: { default: 0 },
				checked: { default: false },
			},
			toDOM(node) {
				const listType = node.attrs?.listType ?? 'bullet';
				const indent = node.attrs?.indent ?? 0;
				const checked = node.attrs?.checked ?? false;

				const li = createBlockElement('li', node.id);
				li.setAttribute('role', 'listitem');
				li.setAttribute('data-list-type', listType);
				li.setAttribute('data-indent', String(indent));
				li.className = `notectl-list-item notectl-list-item--${listType}`;

				if (indent > 0) {
					li.style.marginLeft = `${indent * LIST_MARKER_WIDTH}px`;
				}

				if (listType === 'checklist') {
					li.setAttribute('data-checked', String(checked));
					li.setAttribute('aria-checked', String(checked));
				}
				li.setAttribute('aria-level', String(indent + 1));

				return li;
			},
			wrapper(node) {
				const listType = node.attrs?.listType ?? 'bullet';
				const tag = listType === 'ordered' ? 'ol' : 'ul';
				return {
					tag,
					key: `list-${listType}`,
					className: `notectl-list notectl-list--${listType}`,
					attrs: { role: 'list' },
				};
			},
			toHTML(_node, content) {
				return `<li>${content || '<br>'}</li>`;
			},
			parseHTML: [{ tag: 'li' }],
			sanitize: { tags: ['ul', 'ol', 'li'] },
		});
	}

	private registerCommands(context: PluginContext): void {
		const enabledTypes = this.getEnabledTypes();

		for (const def of enabledTypes) {
			context.registerCommand(`toggleList:${def.type}`, () => {
				return this.toggleList(context, def.type);
			});
		}

		context.registerCommand('indentListItem', () => {
			return this.indent(context);
		});

		context.registerCommand('outdentListItem', () => {
			return this.outdent(context);
		});

		if (this.config.types.includes('checklist')) {
			context.registerCommand('toggleChecklistItem', () => this.toggleChecked(context), {
				readonlyAllowed: true,
			});
		}
	}

	private registerKeymaps(context: PluginContext): void {
		context.registerKeymap({
			Enter: () => this.handleEnter(context),
			Backspace: () => this.handleBackspace(context),
			Tab: () => this.indent(context),
			'Shift-Tab': () => this.outdent(context),
		});
	}

	private registerInputRules(context: PluginContext): void {
		const enabledTypes = this.getEnabledTypes();

		for (const def of enabledTypes) {
			context.registerInputRule({
				pattern: def.inputPattern,
				handler: (state, match, start, _end) => {
					const sel = state.selection;
					if (isNodeSelection(sel)) return null;
					if (!isCollapsed(sel)) return null;

					const block = state.getBlock(sel.anchor.blockId);
					if (!block || block.type !== 'paragraph') return null;

					const matchStr = match[0] ?? '';
					const matchLen = matchStr.length;
					const attrs: Record<string, string | number | boolean> = {
						listType: def.type,
						indent: 0,
					};
					if (def.type === 'checklist') {
						attrs.checked = matchStr.includes('[x]');
					}

					return state
						.transaction('input')
						.deleteTextAt(sel.anchor.blockId, start, start + matchLen)
						.setBlockType(sel.anchor.blockId, nodeType('list_item'), attrs)
						.setSelection(createCollapsedSelection(sel.anchor.blockId, 0))
						.build();
				},
			});
		}
	}

	private getListLabel(type: ListType): string {
		const labels: Record<ListType, string> = {
			bullet: this.locale.bulletList,
			ordered: this.locale.numberedList,
			checklist: this.locale.checklist,
		};
		return labels[type];
	}

	private registerToolbarItems(context: PluginContext): void {
		const enabledTypes = this.getEnabledTypes();
		const lastType = enabledTypes.at(-1);

		for (const def of enabledTypes) {
			context.registerToolbarItem({
				id: `list-${def.type}`,
				group: 'block',
				icon: def.icon,
				label: this.getListLabel(def.type),
				command: `toggleList:${def.type}`,
				priority: def.type === 'bullet' ? 70 : def.type === 'ordered' ? 71 : 72,
				separatorAfter: this.config.separatorAfter && def === lastType,
				isActive: (state) => this.isListActive(state, def.type),
			});
		}
	}

	// --- Command Implementations ---

	private toggleList(context: PluginContext, listType: ListType): boolean {
		const state = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return false;

		// If already this list type, convert back to paragraph
		if (block.type === 'list_item' && block.attrs?.listType === listType) {
			const tr = state
				.transaction('command')
				.setBlockType(sel.anchor.blockId, nodeType('paragraph'))
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		// Convert to list item
		const attrs: Record<string, string | number | boolean> = {
			listType,
			indent: isNodeOfType(block, 'list_item') ? block.attrs.indent : 0,
		};
		if (listType === 'checklist') {
			attrs.checked = false;
		}

		const tr = state
			.transaction('command')
			.setBlockType(sel.anchor.blockId, nodeType('list_item'), attrs)
			.setSelection(sel)
			.build();
		context.dispatch(tr);
		return true;
	}

	private indent(context: PluginContext): boolean {
		const state = context.getState();
		if (isNodeSelection(state.selection)) return false;
		const block = state.getBlock(state.selection.anchor.blockId);
		if (!block || !isNodeOfType(block, 'list_item')) return false;

		if (block.attrs.indent >= this.config.maxIndent) return false;

		return this.setIndent(context, state, block.attrs.indent + 1);
	}

	private outdent(context: PluginContext): boolean {
		const state = context.getState();
		if (isNodeSelection(state.selection)) return false;
		const block = state.getBlock(state.selection.anchor.blockId);
		if (!block || !isNodeOfType(block, 'list_item')) return false;

		if (block.attrs.indent <= 0) return false;

		return this.setIndent(context, state, block.attrs.indent - 1);
	}

	private setIndent(context: PluginContext, state: EditorState, indent: number): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return false;

		const attrs = { ...block.attrs, indent } as Record<string, string | number | boolean>;

		const tr = state
			.transaction('command')
			.setBlockType(sel.anchor.blockId, nodeType('list_item'), attrs)
			.setSelection(sel)
			.build();
		context.dispatch(tr);
		return true;
	}

	private toggleChecked(context: PluginContext, targetId?: BlockId): boolean {
		if (context.isReadOnly() && !this.config.interactiveCheckboxes) return false;

		const state = context.getState();
		const bid: BlockId | null =
			targetId ?? (isNodeSelection(state.selection) ? null : state.selection.anchor.blockId);
		if (!bid) return false;

		const block = state.getBlock(bid);
		if (!block || block.type !== 'list_item' || block.attrs?.listType !== 'checklist') {
			return false;
		}

		const checked: boolean = !block.attrs?.checked;
		const attrs = { ...block.attrs, checked } as Record<string, string | number | boolean>;

		const tr = state
			.transaction('command')
			.setBlockType(bid, nodeType('list_item'), attrs)
			.setSelection(state.selection)
			.build();
		context.dispatch(tr);
		return true;
	}

	/**
	 * Handles Backspace at the start of a list item.
	 * Converts the list item back to a paragraph, preserving text.
	 */
	private handleBackspace(context: PluginContext): boolean {
		const state = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		if (!isCollapsed(sel)) return false;

		const block = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'list_item') return false;
		if (sel.anchor.offset !== 0) return false;

		const tr = state
			.transaction('input')
			.setBlockType(sel.anchor.blockId, nodeType('paragraph'))
			.setSelection(sel)
			.build();
		context.dispatch(tr);
		return true;
	}

	/**
	 * Handles Enter inside a list item.
	 * Empty item → exit list (convert to paragraph).
	 * Non-empty item → split and create a new list item with the same type.
	 */
	private handleEnter(context: PluginContext): boolean {
		const state = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		if (!isCollapsed(sel)) return false;

		const block = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'list_item') return false;

		const text = getBlockText(block);

		if (text === '') {
			// Empty list item → convert to paragraph (exit list)
			const tr = state
				.transaction('input')
				.setBlockType(sel.anchor.blockId, nodeType('paragraph'))
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		// Non-empty → split block and set new block to same list type
		const newBlockId = generateBlockId();
		const attrs: Record<string, string | number | boolean> = {
			listType: isNodeOfType(block, 'list_item') ? block.attrs.listType : 'bullet',
			indent: isNodeOfType(block, 'list_item') ? block.attrs.indent : 0,
		};
		if (attrs.listType === 'checklist') {
			attrs.checked = false;
		}

		const tr = state
			.transaction('input')
			.splitBlock(sel.anchor.blockId, sel.anchor.offset, newBlockId)
			.setBlockType(newBlockId, nodeType('list_item'), attrs)
			.setSelection(createCollapsedSelection(newBlockId, 0))
			.build();
		context.dispatch(tr);
		return true;
	}

	// --- Checkbox Click Handling ---

	private registerCheckboxClickHandler(context: PluginContext): void {
		if (!this.config.types.includes('checklist')) return;

		this.checkboxClickHandler = (e: MouseEvent) => {
			if (context.isReadOnly() && !this.config.interactiveCheckboxes) return;

			const target: EventTarget | null = e.target;
			if (!(target instanceof HTMLElement)) return;

			const li: HTMLElement | null = target.closest('.notectl-list-item--checklist');
			if (!li) return;

			const rect: DOMRect = li.getBoundingClientRect();
			if (e.clientX - rect.left >= LIST_MARKER_WIDTH) return;

			e.preventDefault();

			const bid: string | null = li.getAttribute('data-block-id');
			if (!bid) return;

			this.toggleChecked(context, blockId(bid));
		};

		const container: HTMLElement = context.getContainer();
		container.addEventListener('mousedown', this.checkboxClickHandler);
	}

	// --- Helpers ---

	private isListActive(state: EditorState, listType: ListType): boolean {
		if (isNodeSelection(state.selection)) return false;
		const block = state.getBlock(state.selection.anchor.blockId);
		return block?.type === 'list_item' && block.attrs?.listType === listType;
	}

	private getEnabledTypes(): readonly ListTypeDefinition[] {
		return LIST_TYPE_DEFINITIONS.filter((def) => this.config.types.includes(def.type));
	}
}
