/**
 * Shared helper for resolving a plugin's locale.
 * Priority: per-plugin config override > global LocaleService > English fallback.
 */

import type { PluginContext } from '../plugins/Plugin.js';
import { LocaleServiceKey } from './LocaleService.js';

export function resolvePluginLocale<T>(
	localeMap: Readonly<Record<string, T>>,
	context: PluginContext,
	configOverride?: T,
): T {
	if (configOverride) return configOverride;
	const service = context.getService(LocaleServiceKey);
	const lang: string = service?.getLocale() ?? 'en';
	const resolved: T | undefined = localeMap[lang] ?? localeMap.en;
	if (!resolved) {
		throw new Error('Locale map must contain an "en" entry');
	}
	return resolved;
}
