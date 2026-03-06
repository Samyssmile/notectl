/**
 * Pure functions that handle plugin auto-registration during editor init.
 *
 * Extracted from NotectlEditor to keep the Web Component shell thin.
 * These functions only need a PluginManager + config — zero coupling to DOM.
 *
 * Static imports are used instead of dynamic `import()` to avoid
 * double-bundling issues when consumers re-bundle @notectl/core.
 */

import type { Plugin } from '../plugins/Plugin.js';
import type { PluginManager } from '../plugins/PluginManager.js';
import { CaretNavigationPlugin } from '../plugins/caret-navigation/CaretNavigationPlugin.js';
import { GapCursorPlugin } from '../plugins/gap-cursor/GapCursorPlugin.js';
import {
	type TextFormattingConfig,
	TextFormattingPlugin,
} from '../plugins/text-formatting/TextFormattingPlugin.js';
import type { ToolbarOverflowBehavior } from '../plugins/toolbar/ToolbarOverflowBehavior.js';
import { type ToolbarLayoutConfig, ToolbarPlugin } from '../plugins/toolbar/ToolbarPlugin.js';
import type { ToolbarConfig } from './EditorConfig.js';

type ToolbarInput = ReadonlyArray<ReadonlyArray<Plugin>> | ToolbarConfig;

function isToolbarConfig(toolbar: ToolbarInput): toolbar is ToolbarConfig {
	return !Array.isArray(toolbar);
}

/**
 * Processes the declarative `toolbar` config: registers a ToolbarPlugin
 * with layout groups, then registers all plugins from the toolbar groups.
 * Accepts both the shorthand array and the full ToolbarConfig object.
 */
export function processToolbarConfig(pm: PluginManager, toolbar: ToolbarInput | undefined): void {
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

	const layoutConfig: ToolbarLayoutConfig = { groups, overflow };
	pm.register(new ToolbarPlugin(layoutConfig));
}

/**
 * Auto-registers essential plugins if they were not explicitly provided.
 * Includes TextFormattingPlugin, CaretNavigationPlugin, and GapCursorPlugin.
 */
export function ensureEssentialPlugins(
	pm: PluginManager,
	features?: Partial<TextFormattingConfig>,
): void {
	ensureTextFormattingPlugin(pm, features);
	ensureCaretNavigationPlugin(pm);
	ensureGapCursorPlugin(pm);
}

function ensureTextFormattingPlugin(
	pm: PluginManager,
	features?: Partial<TextFormattingConfig>,
): void {
	if (pm.get('text-formatting') !== undefined) return;

	const config: TextFormattingConfig = {
		bold: features?.bold ?? true,
		italic: features?.italic ?? true,
		underline: features?.underline ?? true,
	};

	pm.register(new TextFormattingPlugin(config));
}

function ensureCaretNavigationPlugin(pm: PluginManager): void {
	if (pm.get('caret-navigation') !== undefined) return;
	pm.register(new CaretNavigationPlugin());
}

function ensureGapCursorPlugin(pm: PluginManager): void {
	if (pm.get('gap-cursor') !== undefined) return;
	pm.register(new GapCursorPlugin());
}
