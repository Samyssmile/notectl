/** Locale interface and default English locale for the HorizontalRulePlugin. */

// --- Locale Interface ---

export interface HorizontalRuleLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const HORIZONTAL_RULE_LOCALE_EN: HorizontalRuleLocale = {
	label: 'Horizontal Rule',
	tooltip: (shortcut: string) => `Horizontal Rule (${shortcut})`,
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: HorizontalRuleLocale }>> =
	import.meta.glob<{ default: HorizontalRuleLocale }>('./locales/*.ts', { eager: false });

export async function loadHorizontalRuleLocale(lang: string): Promise<HorizontalRuleLocale> {
	if (lang === 'en') return HORIZONTAL_RULE_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return HORIZONTAL_RULE_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return HORIZONTAL_RULE_LOCALE_EN;
	}
}
