/** Locale interface and default English locale for the PrintPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface PrintLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
	readonly printingAnnouncement: string;
}

// --- Default English Locale ---

export const PRINT_LOCALE_EN: PrintLocale = {
	label: 'Print',
	tooltip: (shortcut: string) => `Print (${shortcut})`,
	printingAnnouncement: 'Printing',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<PrintLocale> = import.meta.glob<{
	default: PrintLocale;
}>('./locales/*.ts', { eager: false });

export async function loadPrintLocale(lang: string): Promise<PrintLocale> {
	return loadLocaleModule(localeModules, lang, PRINT_LOCALE_EN);
}
