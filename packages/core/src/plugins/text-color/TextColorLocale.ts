/** Locale interface and default English locale for the TextColorPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface TextColorLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly resetLabel: string;
	readonly ariaLabelPrefix: string;
}

// --- Default English Locale ---

export const TEXT_COLOR_LOCALE_EN: TextColorLocale = {
	label: 'Text Color',
	tooltip: 'Text Color',
	resetLabel: 'Default',
	ariaLabelPrefix: 'Text color',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<TextColorLocale> = import.meta.glob<{
	default: TextColorLocale;
}>('./locales/*.ts', { eager: false });

export async function loadTextColorLocale(lang: string): Promise<TextColorLocale> {
	return loadLocaleModule(localeModules, lang, TEXT_COLOR_LOCALE_EN);
}
