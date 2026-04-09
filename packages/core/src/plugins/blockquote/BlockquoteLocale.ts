/**
 * Locale interface and default English locale for the BlockquotePlugin.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface BlockquoteLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const BLOCKQUOTE_LOCALE_EN: BlockquoteLocale = {
	label: 'Blockquote',
	tooltip: (shortcut: string) => `Blockquote (${shortcut})`,
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<BlockquoteLocale> = import.meta.glob<{
	default: BlockquoteLocale;
}>('./locales/*.ts', { eager: false });

export async function loadBlockquoteLocale(lang: string): Promise<BlockquoteLocale> {
	return loadLocaleModule(localeModules, lang, BLOCKQUOTE_LOCALE_EN);
}
