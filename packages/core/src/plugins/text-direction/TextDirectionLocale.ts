/** Locale interface and default English locale for the TextDirectionPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

export interface TextDirectionLocale {
	readonly ltr: string;
	readonly rtl: string;
	readonly auto: string;
	readonly toolbarLabel: string;
	readonly toolbarTooltip: string;
	readonly announceLTR: string;
	readonly announceRTL: string;
	readonly announceAuto: string;
}

export const TEXT_DIRECTION_LOCALE_EN: TextDirectionLocale = {
	ltr: 'Left to Right',
	rtl: 'Right to Left',
	auto: 'Auto',
	toolbarLabel: 'Text Direction',
	toolbarTooltip: 'Text Direction',
	announceLTR: 'Text direction set to left-to-right',
	announceRTL: 'Text direction set to right-to-left',
	announceAuto: 'Text direction set to automatic',
};

const localeModules: LocaleModuleMap<TextDirectionLocale> = import.meta.glob<{
	default: TextDirectionLocale;
}>('./locales/*.ts', { eager: false });

export async function loadTextDirectionLocale(lang: string): Promise<TextDirectionLocale> {
	return loadLocaleModule(localeModules, lang, TEXT_DIRECTION_LOCALE_EN);
}
