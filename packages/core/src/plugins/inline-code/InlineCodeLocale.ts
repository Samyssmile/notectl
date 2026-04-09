/**
 * Locale interface and default English locale for the InlineCodePlugin.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface InlineCodeLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const INLINE_CODE_LOCALE_EN: InlineCodeLocale = {
	label: 'Inline Code',
	tooltip: (shortcut: string) => `Inline Code (${shortcut})`,
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<InlineCodeLocale> = import.meta.glob<{
	default: InlineCodeLocale;
}>('./locales/*.ts', { eager: false });

export async function loadInlineCodeLocale(lang: string): Promise<InlineCodeLocale> {
	return loadLocaleModule(localeModules, lang, INLINE_CODE_LOCALE_EN);
}
