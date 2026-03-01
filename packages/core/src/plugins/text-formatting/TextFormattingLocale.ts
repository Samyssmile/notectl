/**
 * Locale interface and default English locale for the TextFormattingPlugin.
 */

// --- Locale Interface ---

export interface TextFormattingLocale {
	readonly boldLabel: string;
	readonly italicLabel: string;
	readonly underlineLabel: string;
}

// --- Default English Locale ---

export const TEXT_FORMATTING_LOCALE_EN: TextFormattingLocale = {
	boldLabel: 'Bold',
	italicLabel: 'Italic',
	underlineLabel: 'Underline',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: TextFormattingLocale }>> =
	import.meta.glob<{ default: TextFormattingLocale }>('./locales/*.ts', { eager: false });

export async function loadTextFormattingLocale(lang: string): Promise<TextFormattingLocale> {
	if (lang === 'en') return TEXT_FORMATTING_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return TEXT_FORMATTING_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return TEXT_FORMATTING_LOCALE_EN;
	}
}
