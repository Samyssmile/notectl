/** Locale interface and default English locale for the AlignmentPlugin. */

export interface AlignmentLocale {
	readonly alignLeft: string;
	readonly alignCenter: string;
	readonly alignRight: string;
	readonly justify: string;
	readonly toolbarLabel: string;
	readonly toolbarTooltip: string;
}

// --- Default English Locale ---

export const ALIGNMENT_LOCALE_EN: AlignmentLocale = {
	alignLeft: 'Align Left',
	alignCenter: 'Align Center',
	alignRight: 'Align Right',
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
