/**
 * Locale interface and default English locale for the BlockquotePlugin.
 */

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

const localeModules: Record<string, () => Promise<{ default: BlockquoteLocale }>> =
	import.meta.glob<{ default: BlockquoteLocale }>('./locales/*.ts', { eager: false });

export async function loadBlockquoteLocale(lang: string): Promise<BlockquoteLocale> {
	if (lang === 'en') return BLOCKQUOTE_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return BLOCKQUOTE_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return BLOCKQUOTE_LOCALE_EN;
	}
}
