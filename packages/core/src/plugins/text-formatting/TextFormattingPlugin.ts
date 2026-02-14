/**
 * TextFormattingPlugin: registers inline marks (bold, italic, underline)
 * with their MarkSpecs, toggle commands, keyboard shortcuts, and toolbar items.
 *
 * This plugin is data-driven — each mark type is defined declaratively and
 * all registrations (MarkSpec, command, keymap, toolbar item) are derived
 * from the same definition.
 *
 * Supports two separate config dimensions:
 * - Feature config (bold/italic/underline): controls whether the mark is
 *   registered in the schema. When disabled, the keyboard shortcut does nothing.
 * - Toolbar config: controls whether the toolbar button is visible.
 *   When a feature is disabled but toolbar is enabled, the button renders as disabled.
 */

import { isMarkActive, toggleMark } from '../../commands/Commands.js';
import type { ParseRule } from '../../model/ParseRule.js';
import type { SanitizeConfig } from '../../model/SanitizeConfig.js';
import { markType as mkType } from '../../model/TypeBrands.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';

// --- Configuration ---

/** Controls toolbar button visibility per mark. */
export interface TextFormattingToolbarConfig {
	readonly bold?: boolean;
	readonly italic?: boolean;
	readonly underline?: boolean;
}

/** Controls which inline marks are enabled and which toolbar buttons are shown. */
export interface TextFormattingConfig {
	readonly bold: boolean;
	readonly italic: boolean;
	readonly underline: boolean;
	readonly toolbar?: TextFormattingToolbarConfig;
	/** When true, a separator is rendered after the last text-formatting toolbar item. */
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: TextFormattingConfig = {
	bold: true,
	italic: true,
	underline: true,
};

// --- Mark Definitions ---

interface MarkDefinition {
	readonly type: string;
	readonly configKey: keyof Omit<TextFormattingConfig, 'toolbar' | 'separatorAfter'>;
	readonly rank: number;
	readonly tag: string;
	readonly label: string;
	readonly icon: string;
	readonly keyBinding: string;
	readonly toHTMLString: (content: string) => string;
	readonly parseHTML: readonly ParseRule[];
	readonly sanitize: SanitizeConfig;
}

const BOLD_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>';
const ITALIC_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>';
const UNDERLINE_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>';

const MARK_DEFINITIONS: readonly MarkDefinition[] = [
	{
		type: 'bold',
		configKey: 'bold',
		rank: 0,
		tag: 'strong',
		label: 'Bold',
		icon: BOLD_ICON,
		keyBinding: 'Mod-B',
		toHTMLString: (content) => `<strong>${content}</strong>`,
		parseHTML: [{ tag: 'strong' }, { tag: 'b' }],
		sanitize: { tags: ['strong', 'b'] },
	},
	{
		type: 'italic',
		configKey: 'italic',
		rank: 1,
		tag: 'em',
		label: 'Italic',
		icon: ITALIC_ICON,
		keyBinding: 'Mod-I',
		toHTMLString: (content) => `<em>${content}</em>`,
		parseHTML: [{ tag: 'em' }, { tag: 'i' }],
		sanitize: { tags: ['em', 'i'] },
	},
	{
		type: 'underline',
		configKey: 'underline',
		rank: 2,
		tag: 'u',
		label: 'Underline',
		icon: UNDERLINE_ICON,
		keyBinding: 'Mod-U',
		toHTMLString: (content) => `<u>${content}</u>`,
		parseHTML: [{ tag: 'u' }],
		sanitize: { tags: ['u'] },
	},
];

// --- Plugin ---

export class TextFormattingPlugin implements Plugin {
	readonly id = 'text-formatting';
	readonly name = 'Text Formatting';
	readonly priority = 20;

	private readonly config: TextFormattingConfig;

	constructor(config?: Partial<TextFormattingConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		const enabledMarks = MARK_DEFINITIONS.filter((def) => this.config[def.configKey]);

		// Determine which marks will have visible toolbar items
		const visibleToolbarMarks = enabledMarks.filter((def) => this.isToolbarVisible(def.configKey));
		const lastVisibleMark = visibleToolbarMarks.at(-1);

		for (const def of enabledMarks) {
			const isSeparatorTarget = this.config.separatorAfter && def === lastVisibleMark;
			this.registerMark(context, def, isSeparatorTarget);
		}

		this.registerKeymaps(context, enabledMarks);

		// Register disabled placeholder buttons for marks that are disabled
		// as features but explicitly requested in the toolbar config
		this.registerDisabledToolbarItems(context);
	}

	private registerMark(
		context: PluginContext,
		def: MarkDefinition,
		separatorAfter?: boolean,
	): void {
		const commandName = toCommandName(def.type);
		const toolbarVisible = this.isToolbarVisible(def.configKey);

		context.registerMarkSpec({
			type: def.type,
			rank: def.rank,
			toDOM() {
				return document.createElement(def.tag);
			},
			toHTMLString: (_mark, content) => def.toHTMLString(content),
			parseHTML: def.parseHTML,
			sanitize: def.sanitize,
		});

		context.registerCommand(commandName, () => {
			const tr = toggleMark(context.getState(), mkType(def.type));
			if (tr) {
				context.dispatch(tr);
				return true;
			}
			return false;
		});

		if (toolbarVisible) {
			context.registerToolbarItem({
				id: def.type,
				group: 'format',
				icon: def.icon,
				label: def.label,
				tooltip: `${def.label} (${formatShortcut(def.keyBinding)})`,
				command: commandName,
				priority: def.rank * 10 + 10,
				separatorAfter,
				isActive: (state) => isMarkActive(state, mkType(def.type)),
			});
		}
	}

	private registerKeymaps(context: PluginContext, marks: readonly MarkDefinition[]): void {
		const keymap: Record<string, () => boolean> = {};
		for (const def of marks) {
			const commandName = toCommandName(def.type);
			keymap[def.keyBinding] = () => context.executeCommand(commandName);
		}
		if (Object.keys(keymap).length > 0) {
			context.registerKeymap(keymap);
		}
	}

	/**
	 * Registers disabled toolbar buttons for marks whose feature is disabled
	 * but whose toolbar button is explicitly requested.
	 */
	private registerDisabledToolbarItems(context: PluginContext): void {
		if (!this.config.toolbar) return;

		for (const def of MARK_DEFINITIONS) {
			const featureEnabled = this.config[def.configKey];
			const toolbarVisible = this.config.toolbar[def.configKey] ?? true;

			if (!featureEnabled && toolbarVisible) {
				context.registerToolbarItem({
					id: def.type,
					group: 'format',
					icon: def.icon,
					label: def.label,
					command: toCommandName(def.type),
					priority: def.rank * 10 + 10,
					isEnabled: () => false,
				});
			}
		}
	}

	/** Checks if a toolbar button should be visible for a given mark. */
	private isToolbarVisible(
		configKey: keyof Omit<TextFormattingConfig, 'toolbar' | 'separatorAfter'>,
	): boolean {
		if (!this.config.toolbar) return true;
		return this.config.toolbar[configKey] ?? true;
	}
}

/** Converts a mark type to its toggle command name (e.g. 'bold' → 'toggleBold'). */
function toCommandName(markType: string): string {
	return `toggle${markType.charAt(0).toUpperCase()}${markType.slice(1)}`;
}
