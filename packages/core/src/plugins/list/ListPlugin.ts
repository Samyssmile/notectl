/**
 * ListPlugin: registers ordered, unordered, and checklist block types
 * with NodeSpecs, toggle commands, indent/outdent (Tab/Shift-Tab),
 * input rules, and toolbar buttons.
 *
 * This file is a thin orchestrator — command logic, input rules, keyboard
 * handlers, and toolbar rendering are delegated to dedicated modules.
 *
 * List items are modeled as flat blocks with a `listType` and `indent` attribute,
 * allowing simple nesting representation without deep tree structures.
 */

import { LIST_CSS, LIST_MARKER_WIDTH } from '../../editor/styles/list.js';
import { blockId } from '../../model/TypeBrands.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { registerListCommands, toggleChecked } from './ListCommands.js';
import { LIST_TYPE_DEFINITIONS, type ListTypeDefinition } from './ListDefinitions.js';
import { registerListInputRules } from './ListInputRules.js';
import { registerListKeymaps } from './ListKeyboardHandlers.js';
import { LIST_LOCALE_EN, type ListLocale, loadListLocale } from './ListLocale.js';
import { registerListToolbarItems } from './ListToolbarItems.js';

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

	async init(context: PluginContext): Promise<void> {
		this.context = context;
		this.locale = await resolveLocale(context, this.config.locale, LIST_LOCALE_EN, loadListLocale);
		const enabledTypes = this.getEnabledTypes();

		context.registerStyleSheet(LIST_CSS);
		this.registerNodeSpec(context);
		registerListCommands(context, this.config, enabledTypes);
		registerListKeymaps(context);
		registerListInputRules(context, enabledTypes);
		registerListToolbarItems(context, enabledTypes, this.locale);
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
					setStyleProperty(li, 'marginLeft', `${indent * LIST_MARKER_WIDTH}px`);
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
			toHTML(node, content) {
				const listType: string = (node.attrs?.listType as string) ?? 'bullet';
				const checked: boolean = (node.attrs?.checked as boolean) ?? false;

				if (listType === 'checklist') {
					const checkedAttr: string = checked ? ' checked' : '';
					const ariaChecked: string = String(checked);
					return (
						`<li role="checkbox" aria-checked="${ariaChecked}">` +
						`<input type="checkbox" disabled${checkedAttr}>` +
						`${content || '<br>'}</li>`
					);
				}

				return `<li>${content || '<br>'}</li>`;
			},
			parseHTML: [{ tag: 'li' }],
			sanitize: {
				tags: ['ul', 'ol', 'li', 'input'],
				attrs: ['type', 'disabled', 'checked', 'role', 'aria-checked'],
			},
		});
	}

	private registerCheckboxClickHandler(context: PluginContext): void {
		if (!this.config.types.includes('checklist')) return;

		this.checkboxClickHandler = (e: MouseEvent) => {
			if (context.isReadOnly() && !this.config.interactiveCheckboxes) return;

			const target: EventTarget | null = e.target;
			if (!(target instanceof HTMLElement)) return;

			const li: HTMLElement | null = target.closest('.notectl-list-item--checklist');
			if (!li) return;

			const rect: DOMRect = li.getBoundingClientRect();
			const isRtl: boolean = getComputedStyle(li).direction === 'rtl';
			const markerDistance: number = isRtl ? rect.right - e.clientX : e.clientX - rect.left;
			if (markerDistance >= LIST_MARKER_WIDTH) return;

			e.preventDefault();

			const bid: string | null = li.getAttribute('data-block-id');
			if (!bid) return;

			toggleChecked(context, this.config.interactiveCheckboxes, blockId(bid));
		};

		const container: HTMLElement = context.getContainer();
		container.addEventListener('mousedown', this.checkboxClickHandler);
	}

	private getEnabledTypes(): readonly ListTypeDefinition[] {
		return LIST_TYPE_DEFINITIONS.filter((def) => this.config.types.includes(def.type));
	}
}
