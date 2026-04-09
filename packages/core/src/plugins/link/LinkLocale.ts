/**
 * Locale interface and default English locale for the LinkPlugin.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface LinkLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
	readonly removeLink: string;
	readonly removeLinkAria: string;
	readonly urlPlaceholder: string;
	readonly urlAria: string;
	readonly apply: string;
	readonly applyAria: string;
}

// --- Default English Locale ---

export const LINK_LOCALE_EN: LinkLocale = {
	label: 'Link',
	tooltip: (shortcut: string) => `Insert Link (${shortcut})`,
	removeLink: 'Remove Link',
	removeLinkAria: 'Remove link',
	urlPlaceholder: 'https://...',
	urlAria: 'Link URL',
	apply: 'Apply',
	applyAria: 'Apply link',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<LinkLocale> = import.meta.glob<{
	default: LinkLocale;
}>('./locales/*.ts', { eager: false });

export async function loadLinkLocale(lang: string): Promise<LinkLocale> {
	return loadLocaleModule(localeModules, lang, LINK_LOCALE_EN);
}
