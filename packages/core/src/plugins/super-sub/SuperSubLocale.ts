/**
 * Locale interface and default English locale for the SuperSubPlugin.
 */

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

const localeModules: Record<string, () => Promise<{ default: SuperSubLocale }>> = import.meta.glob<{
	default: SuperSubLocale;
}>('./locales/*.ts', { eager: false });

export async function loadSuperSubLocale(lang: string): Promise<SuperSubLocale> {
	if (lang === 'en') return SUPER_SUB_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return SUPER_SUB_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return SUPER_SUB_LOCALE_EN;
	}
}
