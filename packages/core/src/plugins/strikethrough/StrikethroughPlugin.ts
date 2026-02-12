/**
 * StrikethroughPlugin: registers a strikethrough inline mark with MarkSpec,
 * toggle command, keyboard shortcut (Mod-Shift-X), and a toolbar button.
 */

import { isMarkActive, toggleMark } from '../../commands/Commands.js';
import { markType } from '../../model/TypeBrands.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		strikethrough: Record<string, never>;
	}
}

// --- Configuration ---

export interface StrikethroughConfig {
	/** When true, a separator is rendered after the strikethrough toolbar item. */
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: StrikethroughConfig = {};

// --- Plugin ---

export class StrikethroughPlugin implements Plugin {
	readonly id = 'strikethrough';
	readonly name = 'Strikethrough';
	readonly priority = 22;

	private readonly config: StrikethroughConfig;

	constructor(config?: Partial<StrikethroughConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.registerMarkSpec(context);
		this.registerCommand(context);
		this.registerKeymap(context);
		this.registerToolbarItem(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'strikethrough',
			rank: 3,
			toDOM() {
				return document.createElement('s');
			},
		});
	}

	private registerCommand(context: PluginContext): void {
		context.registerCommand('toggleStrikethrough', () => {
			const tr = toggleMark(context.getState(), markType('strikethrough'));
			if (tr) {
				context.dispatch(tr);
				return true;
			}
			return false;
		});
	}

	private registerKeymap(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift-X': () => context.executeCommand('toggleStrikethrough'),
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		const icon =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/></svg>';

		context.registerToolbarItem({
			id: 'strikethrough',
			group: 'format',
			icon,
			label: 'Strikethrough',
			tooltip: `Strikethrough (${formatShortcut('Mod-Shift-X')})`,
			command: 'toggleStrikethrough',
			priority: 40,
			separatorAfter: this.config.separatorAfter,
			isActive: (state) => isMarkActive(state, markType('strikethrough')),
		});
	}
}
