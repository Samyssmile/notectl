/** Locale interface and default English locale for the editor shell. */

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

const localeModules: Record<string, () => Promise<{ default: EditorLocale }>> = import.meta.glob<{
	default: EditorLocale;
}>('./locales/*.ts', { eager: false });

export async function loadEditorLocale(lang: string): Promise<EditorLocale> {
	if (lang === 'en') return EDITOR_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return EDITOR_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return EDITOR_LOCALE_EN;
	}
}
