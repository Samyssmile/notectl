/**
 * Locale interface and default English locale for the SuperSubPlugin.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface SuperSubLocale {
	readonly superscriptLabel: string;
	readonly superscriptTooltip: (shortcut: string) => string;
	readonly subscriptLabel: string;
	readonly subscriptTooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const SUPER_SUB_LOCALE_EN: SuperSubLocale = {
	superscriptLabel: 'Superscript',
	superscriptTooltip: (shortcut: string) => `Superscript (${shortcut})`,
	subscriptLabel: 'Subscript',
	subscriptTooltip: (shortcut: string) => `Subscript (${shortcut})`,
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<SuperSubLocale> = import.meta.glob<{
	default: SuperSubLocale;
}>('./locales/*.ts', { eager: false });

export async function loadSuperSubLocale(lang: string): Promise<SuperSubLocale> {
	return loadLocaleModule(localeModules, lang, SUPER_SUB_LOCALE_EN);
}
