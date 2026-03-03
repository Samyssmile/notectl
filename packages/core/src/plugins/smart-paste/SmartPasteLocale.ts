/** Locale interface and default English locale for the SmartPastePlugin. */

export interface SmartPasteLocale {
	readonly detectedAsCodeBlock: (language: string) => string;
}

export const SMART_PASTE_LOCALE_EN: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Pasted as ${language} code block with syntax highlighting.`,
};

const localeModules: Record<string, () => Promise<{ default: SmartPasteLocale }>> =
	import.meta.glob<{ default: SmartPasteLocale }>('./locales/*.ts', { eager: false });

export async function loadSmartPasteLocale(lang: string): Promise<SmartPasteLocale> {
	if (lang === 'en') return SMART_PASTE_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return SMART_PASTE_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return SMART_PASTE_LOCALE_EN;
	}
}
