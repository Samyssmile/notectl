/**
 * HeadingPlugin: registers Title, Subtitle, and H1–H6 heading block types
 * with NodeSpec, toggle commands, keyboard shortcuts, input rules, and a
 * combobox-style toolbar dropdown that reflects the current block type.
 *
 * This file is a thin orchestrator — command logic, input rules, keyboard
 * handlers, and picker/toolbar rendering are delegated to dedicated modules.
 */

import { HEADING_SELECT_CSS } from '../../editor/styles/heading-select.js';
import { LocaleServiceKey } from '../../i18n/LocaleService.js';
import type { BlockAlignment } from '../../model/BlockAlignment.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import {
	registerHeadingPickerEntries,
	registerHeadingToolbarItem,
} from './HeadingBlockTypePicker.js';
import { registerHeadingCommands } from './HeadingCommands.js';
import { registerHeadingInputRules } from './HeadingInputRules.js';
import { registerHeadingKeymaps } from './HeadingKeyboardHandlers.js';
import { HEADING_LOCALE_EN, type HeadingLocale, loadHeadingLocale } from './HeadingLocale.js';

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

	constructor(config?: Partial<HeadingConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async init(context: PluginContext): Promise<void> {
		if (this.config.locale) {
			this.locale = this.config.locale;
		} else {
			const service = context.getService(LocaleServiceKey);
			const lang: string = service?.getLocale() ?? 'en';
			this.locale = lang === 'en' ? HEADING_LOCALE_EN : await loadHeadingLocale(lang);
		}
		context.registerStyleSheet(HEADING_SELECT_CSS);

		this.registerNodeSpecs(context);
		registerHeadingCommands(context, this.config);
		registerHeadingKeymaps(context, this.config);
		registerHeadingInputRules(context, this.config);
		registerHeadingPickerEntries(context, this.config, this.locale);
		registerHeadingToolbarItem(context, this.locale);
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
				return `<h1 class="notectl-title">${content || '<br>'}</h1>`;
			},
			parseHTML: [
				{
					tag: 'h1',
					priority: 60,
					getAttrs: (el) => (el.classList.contains('notectl-title') ? {} : false),
				},
			],
			sanitize: { tags: ['h1'], attrs: ['class'] },
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
				return `<h2 class="notectl-subtitle">${content || '<br>'}</h2>`;
			},
			parseHTML: [
				{
					tag: 'h2',
					priority: 60,
					getAttrs: (el) => (el.classList.contains('notectl-subtitle') ? {} : false),
				},
			],
			sanitize: { tags: ['h2'], attrs: ['class'] },
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
