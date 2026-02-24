/**
 * Locale interface and default English locale for the StrikethroughPlugin.
 */

// --- Locale Interface ---

export interface StrikethroughLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const STRIKETHROUGH_LOCALE_EN: StrikethroughLocale = {
	label: 'Strikethrough',
	tooltip: (shortcut: string) => `Strikethrough (${shortcut})`,
};

// --- German Locale ---

export const STRIKETHROUGH_LOCALE_DE: StrikethroughLocale = {
	label: 'Durchgestrichen',
	tooltip: (shortcut: string) => `Durchgestrichen (${shortcut})`,
};

// --- Spanish Locale ---

export const STRIKETHROUGH_LOCALE_ES: StrikethroughLocale = {
	label: 'Tachado',
	tooltip: (shortcut: string) => `Tachado (${shortcut})`,
};

// --- French Locale ---

export const STRIKETHROUGH_LOCALE_FR: StrikethroughLocale = {
	label: 'Barré',
	tooltip: (shortcut: string) => `Barré (${shortcut})`,
};

// --- Chinese (Simplified) Locale ---

export const STRIKETHROUGH_LOCALE_ZH: StrikethroughLocale = {
	label: '删除线',
	tooltip: (shortcut: string) => `删除线 (${shortcut})`,
};

// --- Russian Locale ---

export const STRIKETHROUGH_LOCALE_RU: StrikethroughLocale = {
	label: 'Зачёркнутый',
	tooltip: (shortcut: string) => `Зачёркнутый (${shortcut})`,
};

// --- Arabic Locale ---

export const STRIKETHROUGH_LOCALE_AR: StrikethroughLocale = {
	label: 'يتوسطه خط',
	tooltip: (shortcut: string) => `يتوسطه خط (${shortcut})`,
};

// --- Hindi Locale ---

export const STRIKETHROUGH_LOCALE_HI: StrikethroughLocale = {
	label: 'स्ट्राइकथ्रू',
	tooltip: (shortcut: string) => `स्ट्राइकथ्रू (${shortcut})`,
};

// --- Locale Map ---

export const STRIKETHROUGH_LOCALES: Record<string, StrikethroughLocale> = {
	en: STRIKETHROUGH_LOCALE_EN,
	de: STRIKETHROUGH_LOCALE_DE,
	es: STRIKETHROUGH_LOCALE_ES,
	fr: STRIKETHROUGH_LOCALE_FR,
	zh: STRIKETHROUGH_LOCALE_ZH,
	ru: STRIKETHROUGH_LOCALE_RU,
	ar: STRIKETHROUGH_LOCALE_AR,
	hi: STRIKETHROUGH_LOCALE_HI,
};
