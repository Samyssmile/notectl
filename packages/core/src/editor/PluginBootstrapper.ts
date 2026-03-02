/**
 * Pure async functions that handle plugin auto-registration during editor init.
 *
 * Extracted from NotectlEditor to keep the Web Component shell thin.
 * These functions only need a PluginManager + config — zero coupling to DOM.
 */

import type { Plugin } from '../plugins/Plugin.js';
import type { PluginManager } from '../plugins/PluginManager.js';
import type { TextFormattingConfig } from '../plugins/text-formatting/TextFormattingPlugin.js';
import type { ToolbarOverflowBehavior } from '../plugins/toolbar/ToolbarOverflowBehavior.js';
import type { ToolbarLayoutConfig } from '../plugins/toolbar/ToolbarPlugin.js';
import type { ToolbarConfig } from './NotectlEditor.js';

type ToolbarInput = ReadonlyArray<ReadonlyArray<Plugin>> | ToolbarConfig;

function isToolbarConfig(toolbar: ToolbarInput): toolbar is ToolbarConfig {
	return !Array.isArray(toolbar);
}

/**
 * Processes the declarative `toolbar` config: registers a ToolbarPlugin
 * with layout groups, then registers all plugins from the toolbar groups.
 * Accepts both the shorthand array and the full ToolbarConfig object.
 */
export async function processToolbarConfig(
	pm: PluginManager,
	toolbar: ToolbarInput | undefined,
): Promise<void> {
	if (!toolbar) return;

	const pluginGroups: ReadonlyArray<ReadonlyArray<Plugin>> = isToolbarConfig(toolbar)
		? toolbar.groups
		: toolbar;
	const overflow: ToolbarOverflowBehavior | undefined = isToolbarConfig(toolbar)
		? toolbar.overflow
		: undefined;

	const groups: string[][] = [];
	for (const group of pluginGroups) {
		const pluginIds: string[] = [];
		for (const plugin of group) {
			pluginIds.push(plugin.id);
			pm.register(plugin);
		}
		groups.push(pluginIds);
	}

	const { ToolbarPlugin } = await import('../plugins/toolbar/ToolbarPlugin.js');
	const layoutConfig: ToolbarLayoutConfig = { groups, overflow };
	pm.register(new ToolbarPlugin(layoutConfig));
}

/**
 * Auto-registers essential plugins if they were not explicitly provided.
 * Includes TextFormattingPlugin, CaretNavigationPlugin, and GapCursorPlugin.
 */
export async function ensureEssentialPlugins(
	pm: PluginManager,
	features?: Partial<TextFormattingConfig>,
): Promise<void> {
	await ensureTextFormattingPlugin(pm, features);
	await ensureCaretNavigationPlugin(pm);
	await ensureGapCursorPlugin(pm);
}

async function ensureTextFormattingPlugin(
	pm: PluginManager,
	features?: Partial<TextFormattingConfig>,
): Promise<void> {
	if (pm.get('text-formatting') !== undefined) return;

	const config: TextFormattingConfig = {
		bold: features?.bold ?? true,
		italic: features?.italic ?? true,
		underline: features?.underline ?? true,
	};

	const { TextFormattingPlugin } = await import(
		'../plugins/text-formatting/TextFormattingPlugin.js'
	);
	pm.register(new TextFormattingPlugin(config));
}

async function ensureCaretNavigationPlugin(pm: PluginManager): Promise<void> {
	if (pm.get('caret-navigation') !== undefined) return;

	const { CaretNavigationPlugin } = await import(
		'../plugins/caret-navigation/CaretNavigationPlugin.js'
	);
	pm.register(new CaretNavigationPlugin());
}

async function ensureGapCursorPlugin(pm: PluginManager): Promise<void> {
	if (pm.get('gap-cursor') !== undefined) return;

	const { GapCursorPlugin } = await import('../plugins/gap-cursor/GapCursorPlugin.js');
	pm.register(new GapCursorPlugin());
}
