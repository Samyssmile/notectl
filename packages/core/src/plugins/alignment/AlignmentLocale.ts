/** Locale interface and default English locale for the AlignmentPlugin. */

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

const localeModules: Record<string, () => Promise<{ default: AlignmentLocale }>> =
	import.meta.glob<{ default: AlignmentLocale }>('./locales/*.ts', { eager: false });

export async function loadAlignmentLocale(lang: string): Promise<AlignmentLocale> {
	if (lang === 'en') return ALIGNMENT_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return ALIGNMENT_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return ALIGNMENT_LOCALE_EN;
	}
}
