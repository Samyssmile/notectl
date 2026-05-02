/** Locale interface and default English locale for the BidiIsolationPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

export interface BidiIsolationLocale {
	readonly inlineLTR: string;
	readonly inlineRTL: string;
	readonly inlineAuto: string;
	readonly inlineLabel: string;
	readonly inlineTooltip: string;
	readonly announceRemoveBidi: string;
}

export const BIDI_ISOLATION_LOCALE_EN: BidiIsolationLocale = {
	inlineLTR: 'Inline LTR',
	inlineRTL: 'Inline RTL',
	inlineAuto: 'Inline Auto',
	inlineLabel: 'Inline Direction',
	inlineTooltip: 'Inline Direction',
	announceRemoveBidi: 'Inline direction isolation removed',
};

const localeModules: LocaleModuleMap<BidiIsolationLocale> = import.meta.glob<{
	default: BidiIsolationLocale;
}>('./locales/*.ts', { eager: false });

export async function loadBidiIsolationLocale(lang: string): Promise<BidiIsolationLocale> {
	return loadLocaleModule(localeModules, lang, BIDI_ISOLATION_LOCALE_EN);
}
