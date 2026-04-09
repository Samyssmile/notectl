/** Locale interface and default English locale for the GapCursorPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface GapCursorLocale {
	readonly gapCursorActive: string;
}

// --- Default English Locale ---

export const GAP_CURSOR_LOCALE_EN: GapCursorLocale = {
	gapCursorActive: 'Gap cursor active. Type to insert new paragraph.',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<GapCursorLocale> = import.meta.glob<{
	default: GapCursorLocale;
}>('./locales/*.ts', { eager: false });

export async function loadGapCursorLocale(lang: string): Promise<GapCursorLocale> {
	return loadLocaleModule(localeModules, lang, GAP_CURSOR_LOCALE_EN);
}
