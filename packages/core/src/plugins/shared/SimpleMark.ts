/**
 * Registers the common core of a simple toggle mark: its MarkSpec, a toggle
 * command, an optional keyboard shortcut, and an optional toolbar button.
 *
 * Plugins that need more (input rules, exclusivity middleware, config-driven
 * variants) layer those on top after calling this — it deliberately models only
 * the shared core, not every mark plugin.
 */

import { isMarkActive, toggleMark } from '../../commands/Commands.js';
import type { MarkSpec } from '../../model/MarkSpec.js';
import { markType } from '../../model/TypeBrands.js';
import type { PluginContext } from '../Plugin.js';
import { dispatchIfPresent } from './PluginHelpers.js';

export interface SimpleMarkToolbar {
	readonly id: string;
	readonly group: string;
	readonly icon: string;
	readonly label: string;
	readonly tooltip: string;
}

export interface SimpleMarkDefinition {
	/** The mark spec to register (defines DOM/HTML rendering and parsing). */
	readonly markSpec: MarkSpec;
	/** Toggle command name, e.g. `'toggleStrikethrough'`. */
	readonly command: string;
	/** Keyboard shortcut bound to the command; omit or `null` to skip. */
	readonly keyBinding?: string | null;
	/** Toolbar button; omit to skip. */
	readonly toolbar?: SimpleMarkToolbar;
}

/** Registers a simple toggle mark's spec, command, keymap, and toolbar item. */
export function registerSimpleMark(context: PluginContext, def: SimpleMarkDefinition): void {
	const type = markType(def.markSpec.type);

	context.registerMarkSpec(def.markSpec);

	context.registerCommand(def.command, () =>
		dispatchIfPresent(context, toggleMark(context.getState(), type)),
	);

	if (def.keyBinding) {
		context.registerKeymap({ [def.keyBinding]: () => context.executeCommand(def.command) });
	}

	if (def.toolbar) {
		context.registerToolbarItem({
			id: def.toolbar.id,
			group: def.toolbar.group,
			icon: def.toolbar.icon,
			label: def.toolbar.label,
			tooltip: def.toolbar.tooltip,
			command: def.command,
			isActive: (state) => isMarkActive(state, type),
		});
	}
}
