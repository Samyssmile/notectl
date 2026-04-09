/** Locale interface and default English locale for the ToolbarPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface ToolbarLocale {
	readonly formattingOptionsAria: string;
	readonly moreToolsAria: string;
	readonly gridPickerLabel: (rows: number, cols: number) => string;
}

// --- Default English Locale ---

export const TOOLBAR_LOCALE_EN: ToolbarLocale = {
	formattingOptionsAria: 'Formatting options',
	moreToolsAria: 'More tools',
	gridPickerLabel: (rows: number, cols: number) => `${rows} x ${cols}`,
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<ToolbarLocale> = import.meta.glob<{
	default: ToolbarLocale;
}>('./locales/*.ts', { eager: false });

export async function loadToolbarLocale(lang: string): Promise<ToolbarLocale> {
	return loadLocaleModule(localeModules, lang, TOOLBAR_LOCALE_EN);
}
