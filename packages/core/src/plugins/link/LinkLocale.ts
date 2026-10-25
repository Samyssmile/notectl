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
	readonly invalidUrl: string;
	/** Optional for compatibility with existing custom locales; defaults to English. */
	readonly openLink?: string;
	readonly openLinkInNewTab?: string;
	readonly closePreview?: string;
	/** Screen reader announcement when a click or tap opens the non-modal preview. */
	readonly previewOpened?: string;
}

// --- Default English Locale ---

export const LINK_LOCALE_EN: Required<LinkLocale> = {
	label: 'Link',
	tooltip: (shortcut: string) => `Insert Link (${shortcut})`,
	removeLink: 'Remove Link',
	removeLinkAria: 'Remove link',
	urlPlaceholder: 'https://...',
	urlAria: 'Link URL',
	apply: 'Apply',
	applyAria: 'Apply link',
	invalidUrl: 'Only http(s), mailto, tel, fragments, and relative paths are allowed.',
	openLink: 'Open link',
	openLinkInNewTab: 'Open link in new tab',
	closePreview: 'Close link preview',
	previewOpened: 'Link preview opened. Press Tab to open the link or Escape to dismiss.',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<LinkLocale> = import.meta.glob<{
	default: LinkLocale;
}>('./locales/*.ts', { eager: false });

export async function loadLinkLocale(lang: string): Promise<LinkLocale> {
	return loadLocaleModule(localeModules, lang, LINK_LOCALE_EN);
}
