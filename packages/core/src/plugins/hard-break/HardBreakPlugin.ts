/**
 * HardBreakPlugin: registers a hard line break (Shift+Enter → `<br>`)
 * as an InlineNode, with command and keymap bindings.
 */

import { insertHardBreakCommand } from '../../commands/Commands.js';
import type { Plugin, PluginContext } from '../Plugin.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface InlineNodeAttrRegistry {
		hard_break: Record<string, never>;
	}
}

// --- Plugin ---

export class HardBreakPlugin implements Plugin {
	readonly id = 'hard-break';
	readonly name = 'Hard Break';
	readonly priority = 10;

	init(context: PluginContext): void {
		this.registerInlineNodeSpec(context);
		this.registerCommands(context);
		this.registerKeymap(context);
	}

	private registerInlineNodeSpec(context: PluginContext): void {
		context.registerInlineNodeSpec({
			type: 'hard_break',
			toDOM() {
				return document.createElement('br');
			},
			toHTMLString() {
				return '<br>';
			},
			parseHTML: [{ tag: 'br' }],
			sanitize: { tags: ['br'] },
		});
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('insertHardBreak', () => {
			const state = context.getState();
			const tr = insertHardBreakCommand(state);
			if (!tr) return false;
			context.dispatch(tr);
			return true;
		});
	}

	private registerKeymap(context: PluginContext): void {
		context.registerKeymap({
			'Shift-Enter': () => {
				const state = context.getState();
				const tr = insertHardBreakCommand(state);
				if (!tr) return false;
				context.dispatch(tr);
				return true;
			},
		});
	}
}
