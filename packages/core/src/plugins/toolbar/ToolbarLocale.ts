/** Locale interface and default English locale for the ToolbarPlugin. */

// --- Locale Interface ---

export interface ToolbarLocale {
	readonly formattingOptionsAria: string;
	readonly moreToolsAria: string;
}

// --- Default English Locale ---

export const TOOLBAR_LOCALE_EN: ToolbarLocale = {
	formattingOptionsAria: 'Formatting options',
	moreToolsAria: 'More tools',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: ToolbarLocale }>> = import.meta.glob<{
	default: ToolbarLocale;
}>('./locales/*.ts', { eager: false });

export async function loadToolbarLocale(lang: string): Promise<ToolbarLocale> {
	if (lang === 'en') return TOOLBAR_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return TOOLBAR_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return TOOLBAR_LOCALE_EN;
	}
}
