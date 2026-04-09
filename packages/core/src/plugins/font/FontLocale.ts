/** Locale interface and default English locale for the FontPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface FontLocale {
	readonly label: string;
	readonly tooltip: string;
}

// --- Default English Locale ---

export const FONT_LOCALE_EN: FontLocale = {
	label: 'Font',
	tooltip: 'Font Family',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<FontLocale> = import.meta.glob<{
	default: FontLocale;
}>('./locales/*.ts', { eager: false });

export async function loadFontLocale(lang: string): Promise<FontLocale> {
	return loadLocaleModule(localeModules, lang, FONT_LOCALE_EN);
}
