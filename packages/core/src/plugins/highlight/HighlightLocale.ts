/** Locale interface and default English locale for the HighlightPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface HighlightLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly resetLabel: string;
	readonly ariaLabelPrefix: string;
}

// --- Default English Locale ---

export const HIGHLIGHT_LOCALE_EN: HighlightLocale = {
	label: 'Highlight',
	tooltip: 'Highlight Color',
	resetLabel: 'None',
	ariaLabelPrefix: 'Highlight color',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<HighlightLocale> = import.meta.glob<{
	default: HighlightLocale;
}>('./locales/*.ts', { eager: false });

export async function loadHighlightLocale(lang: string): Promise<HighlightLocale> {
	return loadLocaleModule(localeModules, lang, HIGHLIGHT_LOCALE_EN);
}
