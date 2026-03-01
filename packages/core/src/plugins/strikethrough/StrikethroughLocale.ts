/**
 * Locale interface and default English locale for the StrikethroughPlugin.
 */

// --- Locale Interface ---

export interface StrikethroughLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const STRIKETHROUGH_LOCALE_EN: StrikethroughLocale = {
	label: 'Strikethrough',
	tooltip: (shortcut: string) => `Strikethrough (${shortcut})`,
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: StrikethroughLocale }>> =
	import.meta.glob<{ default: StrikethroughLocale }>('./locales/*.ts', { eager: false });

export async function loadStrikethroughLocale(lang: string): Promise<StrikethroughLocale> {
	if (lang === 'en') return STRIKETHROUGH_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return STRIKETHROUGH_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return STRIKETHROUGH_LOCALE_EN;
	}
}
