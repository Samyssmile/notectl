/** Locale interface and default English locale for the FontPlugin. */

// --- Locale Interface ---

export interface FontLocale {
	readonly label: string;
	readonly tooltip: string;
}

// --- Default English Locale ---

export const FONT_LOCALE_EN: FontLocale = {
	label: 'Font',
	tooltip: 'Font Family',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: FontLocale }>> = import.meta.glob<{
	default: FontLocale;
}>('./locales/*.ts', { eager: false });

export async function loadFontLocale(lang: string): Promise<FontLocale> {
	if (lang === 'en') return FONT_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return FONT_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return FONT_LOCALE_EN;
	}
}
