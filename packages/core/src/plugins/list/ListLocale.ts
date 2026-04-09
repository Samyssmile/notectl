/**
 * Locale interface and default English locale for the ListPlugin.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface ListLocale {
	readonly bulletList: string;
	readonly numberedList: string;
	readonly checklist: string;
}

// --- Default English Locale ---

export const LIST_LOCALE_EN: ListLocale = {
	bulletList: 'Bullet List',
	numberedList: 'Numbered List',
	checklist: 'Checklist',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<ListLocale> = import.meta.glob<{
	default: ListLocale;
}>('./locales/*.ts', { eager: false });

export async function loadListLocale(lang: string): Promise<ListLocale> {
	return loadLocaleModule(localeModules, lang, LIST_LOCALE_EN);
}
