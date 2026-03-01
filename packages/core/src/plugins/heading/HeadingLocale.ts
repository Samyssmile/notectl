/**
 * Locale interface and default English locale for the HeadingPlugin.
 */

// --- Locale Interface ---

export interface HeadingLocale {
	readonly paragraph: string;
	readonly title: string;
	readonly subtitle: string;
	readonly heading1: string;
	readonly heading2: string;
	readonly heading3: string;
	readonly heading4: string;
	readonly heading5: string;
	readonly heading6: string;
	readonly blockTypeLabel: string;
	readonly blockTypesAria: string;
}

// --- Default English Locale ---

export const HEADING_LOCALE_EN: HeadingLocale = {
	paragraph: 'Paragraph',
	title: 'Title',
	subtitle: 'Subtitle',
	heading1: 'Heading 1',
	heading2: 'Heading 2',
	heading3: 'Heading 3',
	heading4: 'Heading 4',
	heading5: 'Heading 5',
	heading6: 'Heading 6',
	blockTypeLabel: 'Block Type',
	blockTypesAria: 'Block types',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: HeadingLocale }>> = import.meta.glob<{
	default: HeadingLocale;
}>('./locales/*.ts', { eager: false });

export async function loadHeadingLocale(lang: string): Promise<HeadingLocale> {
	if (lang === 'en') return HEADING_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return HEADING_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return HEADING_LOCALE_EN;
	}
}
