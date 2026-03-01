/** Locale interface and default English locale for the TextColorPlugin. */

// --- Locale Interface ---

export interface TextColorLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly resetLabel: string;
	readonly ariaLabelPrefix: string;
}

// --- Default English Locale ---

export const TEXT_COLOR_LOCALE_EN: TextColorLocale = {
	label: 'Text Color',
	tooltip: 'Text Color',
	resetLabel: 'Default',
	ariaLabelPrefix: 'Text color',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: TextColorLocale }>> =
	import.meta.glob<{ default: TextColorLocale }>('./locales/*.ts', { eager: false });

export async function loadTextColorLocale(lang: string): Promise<TextColorLocale> {
	if (lang === 'en') return TEXT_COLOR_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return TEXT_COLOR_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return TEXT_COLOR_LOCALE_EN;
	}
}
