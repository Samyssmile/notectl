/** Locale interface and default English locale for the HorizontalRulePlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

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

const localeModules: LocaleModuleMap<HorizontalRuleLocale> = import.meta.glob<{
	default: HorizontalRuleLocale;
}>('./locales/*.ts', { eager: false });

export async function loadHorizontalRuleLocale(lang: string): Promise<HorizontalRuleLocale> {
	return loadLocaleModule(localeModules, lang, HORIZONTAL_RULE_LOCALE_EN);
}
