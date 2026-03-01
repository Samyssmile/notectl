/** Locale interface and default English locale for the FontSizePlugin. */

// --- Locale Interface ---

export interface FontSizeLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly customFontSizeAria: string;
	readonly fontSizesAria: string;
}

// --- Default English Locale ---

export const FONT_SIZE_LOCALE_EN: FontSizeLocale = {
	label: 'Font Size',
	tooltip: 'Font Size',
	customFontSizeAria: 'Custom font size',
	fontSizesAria: 'Font sizes',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: FontSizeLocale }>> = import.meta.glob<{
	default: FontSizeLocale;
}>('./locales/*.ts', { eager: false });

export async function loadFontSizeLocale(lang: string): Promise<FontSizeLocale> {
	if (lang === 'en') return FONT_SIZE_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return FONT_SIZE_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return FONT_SIZE_LOCALE_EN;
	}
}
