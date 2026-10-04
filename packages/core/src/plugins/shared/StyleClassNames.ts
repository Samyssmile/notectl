/**
 * The `styleClasses` option of formatting plugins (#269): application CSS
 * classes keyed by the plugin's own values, registered as one style class per
 * entry. Kept out of `PluginHelpers` so only plugins that offer the option load it.
 */

import type { StyleClassNames } from '../../model/StyleClass.js';
import type { PluginContext } from '../Plugin.js';

/**
 * Registers a plugin's `styleClasses` option. `declarationFor` turns a key into
 * the declaration the plugin exports for that value, with the same function
 * its export uses, and throws a `TypeError` for a key that is not a valid value.
 * Errors name the plugin, so a misconfiguration fails `init()` with a clear fix.
 */
export function registerStyleClassNames(
	context: PluginContext,
	owner: string,
	styleClasses: StyleClassNames<PropertyKey> | undefined,
	declarationFor: (key: string) => string,
): void {
	if (!styleClasses) return;
	for (const [key, className] of Object.entries(styleClasses)) {
		if (className === undefined) continue;
		try {
			context.registerStyleClass({ className, declaration: declarationFor(key) });
		} catch (error: unknown) {
			if (!(error instanceof TypeError)) throw error;
			throw new TypeError(`${owner} styleClasses: ${error.message}`);
		}
	}
}
