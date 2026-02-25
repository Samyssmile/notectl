/**
 * HeadingPlugin: registers Title, Subtitle, and H1–H6 heading block types
 * with NodeSpec, toggle commands, keyboard shortcuts, input rules, and a
 * combobox-style toolbar dropdown that reflects the current block type.
 *
 * This file is a thin orchestrator — command logic, input rules, keyboard
 * handlers, and picker/toolbar rendering are delegated to dedicated modules.
 */

import { HEADING_SELECT_CSS } from '../../editor/styles/heading-select.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import { createBlockElement } from '../../model/NodeSpec.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import type { BlockAlignment } from '../alignment/AlignmentPlugin.js';
import {
	registerHeadingPickerEntries,
	registerHeadingToolbarItem,
	updateComboLabel,
} from './HeadingBlockTypePicker.js';
import { registerHeadingCommands } from './HeadingCommands.js';
import { registerHeadingInputRules } from './HeadingInputRules.js';
import { registerHeadingKeymaps } from './HeadingKeyboardHandlers.js';
import { HEADING_LOCALES, type HeadingLocale } from './HeadingLocale.js';

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
	readonly locale?: HeadingLocale;
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

// --- Plugin ---

export class HeadingPlugin implements Plugin {
	readonly id = 'heading';
	readonly name = 'Heading';
	readonly priority = 30;

	private readonly config: HeadingConfig;
	private locale!: HeadingLocale;
	private context: PluginContext | null = null;
	private comboLabel: HTMLSpanElement | null = null;

	constructor(config?: Partial<HeadingConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(HEADING_LOCALES, context, this.config.locale);
		context.registerStyleSheet(HEADING_SELECT_CSS);
		this.context = context;

		this.registerNodeSpecs(context);
		registerHeadingCommands(context, this.config);
		registerHeadingKeymaps(context, this.config);
		registerHeadingInputRules(context, this.config);
		registerHeadingPickerEntries(context, this.config, this.locale);
		registerHeadingToolbarItem(context, this.config, this.locale);
	}

	destroy(): void {
		this.context = null;
		this.comboLabel = null;
	}

	onStateChange(_oldState: EditorState, _newState: EditorState, _tr: Transaction): void {
		if (!this.context) return;
		this.comboLabel = updateComboLabel(_newState, this.context, this.locale, this.comboLabel);
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
}
