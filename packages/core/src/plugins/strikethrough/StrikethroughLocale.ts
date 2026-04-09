/**
 * Locale interface and default English locale for the StrikethroughPlugin.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface StrikethroughLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const STRIKETHROUGH_LOCALE_EN: StrikethroughLocale = {
	label: 'Strikethrough',
	tooltip: (shortcut: string) => `Strikethrough (${shortcut})`,
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<StrikethroughLocale> = import.meta.glob<{
	default: StrikethroughLocale;
}>('./locales/*.ts', { eager: false });

export async function loadStrikethroughLocale(lang: string): Promise<StrikethroughLocale> {
	return loadLocaleModule(localeModules, lang, STRIKETHROUGH_LOCALE_EN);
}
