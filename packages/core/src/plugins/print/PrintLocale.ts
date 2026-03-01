/** Locale interface and default English locale for the PrintPlugin. */

// --- Locale Interface ---

export interface PrintLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
	readonly printingAnnouncement: string;
}

// --- Default English Locale ---

export const PRINT_LOCALE_EN: PrintLocale = {
	label: 'Print',
	tooltip: (shortcut: string) => `Print (${shortcut})`,
	printingAnnouncement: 'Printing',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: PrintLocale }>> = import.meta.glob<{
	default: PrintLocale;
}>('./locales/*.ts', { eager: false });

export async function loadPrintLocale(lang: string): Promise<PrintLocale> {
	if (lang === 'en') return PRINT_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return PRINT_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return PRINT_LOCALE_EN;
	}
}
