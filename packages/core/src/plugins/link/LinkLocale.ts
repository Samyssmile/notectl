/**
 * Locale interface and default English locale for the LinkPlugin.
 */

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

const localeModules: Record<string, () => Promise<{ default: LinkLocale }>> = import.meta.glob<{
	default: LinkLocale;
}>('./locales/*.ts', { eager: false });

export async function loadLinkLocale(lang: string): Promise<LinkLocale> {
	if (lang === 'en') return LINK_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return LINK_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return LINK_LOCALE_EN;
	}
}
