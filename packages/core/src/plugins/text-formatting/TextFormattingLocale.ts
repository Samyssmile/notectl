/**
 * Locale interface and default English locale for the TextFormattingPlugin.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface TextFormattingLocale {
	readonly boldLabel: string;
	readonly italicLabel: string;
	readonly underlineLabel: string;
}

// --- Default English Locale ---

export const TEXT_FORMATTING_LOCALE_EN: TextFormattingLocale = {
	boldLabel: 'Bold',
	italicLabel: 'Italic',
	underlineLabel: 'Underline',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<TextFormattingLocale> = import.meta.glob<{
	default: TextFormattingLocale;
}>('./locales/*.ts', { eager: false });

export async function loadTextFormattingLocale(lang: string): Promise<TextFormattingLocale> {
	return loadLocaleModule(localeModules, lang, TEXT_FORMATTING_LOCALE_EN);
}
