/** Locale interface and default English locale for the HighlightPlugin. */

// --- Locale Interface ---

export interface HighlightLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly resetLabel: string;
	readonly ariaLabelPrefix: string;
}

// --- Default English Locale ---

export const HIGHLIGHT_LOCALE_EN: HighlightLocale = {
	label: 'Highlight',
	tooltip: 'Highlight Color',
	resetLabel: 'None',
	ariaLabelPrefix: 'Highlight color',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: HighlightLocale }>> =
	import.meta.glob<{ default: HighlightLocale }>('./locales/*.ts', { eager: false });

export async function loadHighlightLocale(lang: string): Promise<HighlightLocale> {
	if (lang === 'en') return HIGHLIGHT_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return HIGHLIGHT_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return HIGHLIGHT_LOCALE_EN;
	}
}
