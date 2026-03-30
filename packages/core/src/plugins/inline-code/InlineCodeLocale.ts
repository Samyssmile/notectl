/**
 * Locale interface and default English locale for the InlineCodePlugin.
 */

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

const localeModules: Record<string, () => Promise<{ default: InlineCodeLocale }>> =
	import.meta.glob<{ default: InlineCodeLocale }>('./locales/*.ts', { eager: false });

export async function loadInlineCodeLocale(lang: string): Promise<InlineCodeLocale> {
	if (lang === 'en') return INLINE_CODE_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return INLINE_CODE_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return INLINE_CODE_LOCALE_EN;
	}
}
