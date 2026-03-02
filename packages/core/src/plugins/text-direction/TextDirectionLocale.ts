/** Locale interface and default English locale for the TextDirectionPlugin. */

export interface TextDirectionLocale {
	readonly ltr: string;
	readonly rtl: string;
	readonly auto: string;
	readonly toolbarLabel: string;
	readonly toolbarTooltip: string;
	readonly announceLTR: string;
	readonly announceRTL: string;
	readonly announceAuto: string;
	readonly inlineLTR: string;
	readonly inlineRTL: string;
	readonly inlineAuto: string;
	readonly inlineLabel: string;
	readonly inlineTooltip: string;
	readonly announceRemoveBidi: string;
}

// --- Default English Locale ---

export const TEXT_DIRECTION_LOCALE_EN: TextDirectionLocale = {
	ltr: 'Left to Right',
	rtl: 'Right to Left',
	auto: 'Auto',
	toolbarLabel: 'Text Direction',
	toolbarTooltip: 'Text Direction',
	announceLTR: 'Text direction set to left-to-right',
	announceRTL: 'Text direction set to right-to-left',
	announceAuto: 'Text direction set to automatic',
	inlineLTR: 'Inline LTR',
	inlineRTL: 'Inline RTL',
	inlineAuto: 'Inline Auto',
	inlineLabel: 'Inline Direction',
	inlineTooltip: 'Inline Direction',
	announceRemoveBidi: 'Inline direction isolation removed',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: TextDirectionLocale }>> =
	import.meta.glob<{ default: TextDirectionLocale }>('./locales/*.ts', { eager: false });

export async function loadTextDirectionLocale(lang: string): Promise<TextDirectionLocale> {
	if (lang === 'en') return TEXT_DIRECTION_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return TEXT_DIRECTION_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return TEXT_DIRECTION_LOCALE_EN;
	}
}
