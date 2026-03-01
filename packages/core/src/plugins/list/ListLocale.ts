/**
 * Locale interface and default English locale for the ListPlugin.
 */

// --- Locale Interface ---

export interface ListLocale {
	readonly bulletList: string;
	readonly numberedList: string;
	readonly checklist: string;
}

// --- Default English Locale ---

export const LIST_LOCALE_EN: ListLocale = {
	bulletList: 'Bullet List',
	numberedList: 'Numbered List',
	checklist: 'Checklist',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: ListLocale }>> = import.meta.glob<{
	default: ListLocale;
}>('./locales/*.ts', { eager: false });

export async function loadListLocale(lang: string): Promise<ListLocale> {
	if (lang === 'en') return LIST_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return LIST_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return LIST_LOCALE_EN;
	}
}
