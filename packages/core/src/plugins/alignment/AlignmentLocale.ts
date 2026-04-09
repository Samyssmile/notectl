/** Locale interface and default English locale for the AlignmentPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

export interface AlignmentLocale {
	readonly alignStart: string;
	readonly alignCenter: string;
	readonly alignEnd: string;
	readonly justify: string;
	readonly toolbarLabel: string;
	readonly toolbarTooltip: string;
}

// --- Default English Locale ---

export const ALIGNMENT_LOCALE_EN: AlignmentLocale = {
	alignStart: 'Align Start',
	alignCenter: 'Align Center',
	alignEnd: 'Align End',
	justify: 'Justify',
	toolbarLabel: 'Alignment',
	toolbarTooltip: 'Alignment',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<AlignmentLocale> = import.meta.glob<{
	default: AlignmentLocale;
}>('./locales/*.ts', { eager: false });

export async function loadAlignmentLocale(lang: string): Promise<AlignmentLocale> {
	return loadLocaleModule(localeModules, lang, ALIGNMENT_LOCALE_EN);
}
