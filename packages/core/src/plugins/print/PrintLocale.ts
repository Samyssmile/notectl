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

// --- German Locale ---

export const PRINT_LOCALE_DE: PrintLocale = {
	label: 'Drucken',
	tooltip: (shortcut: string) => `Drucken (${shortcut})`,
	printingAnnouncement: 'Druckvorgang',
};

// --- Spanish Locale ---

export const PRINT_LOCALE_ES: PrintLocale = {
	label: 'Imprimir',
	tooltip: (shortcut: string) => `Imprimir (${shortcut})`,
	printingAnnouncement: 'Imprimiendo',
};

// --- French Locale ---

export const PRINT_LOCALE_FR: PrintLocale = {
	label: 'Imprimer',
	tooltip: (shortcut: string) => `Imprimer (${shortcut})`,
	printingAnnouncement: 'Impression',
};

// --- Chinese (Simplified) Locale ---

export const PRINT_LOCALE_ZH: PrintLocale = {
	label: '打印',
	tooltip: (shortcut: string) => `打印 (${shortcut})`,
	printingAnnouncement: '正在打印',
};

// --- Russian Locale ---

export const PRINT_LOCALE_RU: PrintLocale = {
	label: 'Печать',
	tooltip: (shortcut: string) => `Печать (${shortcut})`,
	printingAnnouncement: 'Печать',
};

// --- Arabic Locale ---

export const PRINT_LOCALE_AR: PrintLocale = {
	label: 'طباعة',
	tooltip: (shortcut: string) => `طباعة (${shortcut})`,
	printingAnnouncement: 'جارٍ الطباعة',
};

// --- Hindi Locale ---

export const PRINT_LOCALE_HI: PrintLocale = {
	label: 'प्रिंट',
	tooltip: (shortcut: string) => `प्रिंट (${shortcut})`,
	printingAnnouncement: 'प्रिंट हो रहा है',
};

// --- Locale Map ---

export const PRINT_LOCALES: Record<string, PrintLocale> = {
	en: PRINT_LOCALE_EN,
	de: PRINT_LOCALE_DE,
	es: PRINT_LOCALE_ES,
	fr: PRINT_LOCALE_FR,
	zh: PRINT_LOCALE_ZH,
	ru: PRINT_LOCALE_RU,
	ar: PRINT_LOCALE_AR,
	hi: PRINT_LOCALE_HI,
};
