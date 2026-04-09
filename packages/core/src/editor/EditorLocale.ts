/** Locale interface and default English locale for the editor shell. */

import { type LocaleModuleMap, loadLocaleModule } from '../plugins/shared/LocaleLoader.js';

// --- Locale Interface ---

export interface EditorLocale {
	readonly ariaLabel: string;
	readonly ariaDescription: string;
	readonly defaultPlaceholder: string;
}

// --- Default English Locale ---

export const EDITOR_LOCALE_EN: EditorLocale = {
	ariaLabel: 'Rich text editor',
	ariaDescription: 'Press Escape to exit the editor',
	defaultPlaceholder: 'Start typing...',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<EditorLocale> = import.meta.glob<{
	default: EditorLocale;
}>('./locales/*.ts', { eager: false });

export async function loadEditorLocale(lang: string): Promise<EditorLocale> {
	return loadLocaleModule(localeModules, lang, EDITOR_LOCALE_EN);
}
