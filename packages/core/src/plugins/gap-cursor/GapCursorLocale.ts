/** Locale interface and default English locale for the GapCursorPlugin. */

// --- Locale Interface ---

export interface GapCursorLocale {
	readonly gapCursorActive: string;
}

// --- Default English Locale ---

export const GAP_CURSOR_LOCALE_EN: GapCursorLocale = {
	gapCursorActive: 'Gap cursor active. Type to insert new paragraph.',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: GapCursorLocale }>> =
	import.meta.glob<{ default: GapCursorLocale }>('./locales/*.ts', { eager: false });

export async function loadGapCursorLocale(lang: string): Promise<GapCursorLocale> {
	if (lang === 'en') return GAP_CURSOR_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return GAP_CURSOR_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return GAP_CURSOR_LOCALE_EN;
	}
}
