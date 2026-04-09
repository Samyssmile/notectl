/** Locale interface and default English locale for the FontSizePlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface FontSizeLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly customFontSizeAria: string;
	readonly fontSizesAria: string;
}

// --- Default English Locale ---

export const FONT_SIZE_LOCALE_EN: FontSizeLocale = {
	label: 'Font Size',
	tooltip: 'Font Size',
	customFontSizeAria: 'Custom font size',
	fontSizesAria: 'Font sizes',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<FontSizeLocale> = import.meta.glob<{
	default: FontSizeLocale;
}>('./locales/*.ts', { eager: false });

export async function loadFontSizeLocale(lang: string): Promise<FontSizeLocale> {
	return loadLocaleModule(localeModules, lang, FONT_SIZE_LOCALE_EN);
}
