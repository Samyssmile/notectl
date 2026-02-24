/**
 * Locale interface and default English locale for the TextFormattingPlugin.
 */

// --- Locale Interface ---

export interface TextFormattingLocale {
	readonly boldLabel: string;
	readonly italicLabel: string;
	readonly underlineLabel: string;
}

// --- Default English Locale ---

export const TEXT_FORMATTING_LOCALE_EN: TextFormattingLocale = {
	boldLabel: 'Bold',
	italicLabel: 'Italic',
	underlineLabel: 'Underline',
};

// --- German Locale ---

export const TEXT_FORMATTING_LOCALE_DE: TextFormattingLocale = {
	boldLabel: 'Fett',
	italicLabel: 'Kursiv',
	underlineLabel: 'Unterstrichen',
};

// --- Spanish Locale ---

export const TEXT_FORMATTING_LOCALE_ES: TextFormattingLocale = {
	boldLabel: 'Negrita',
	italicLabel: 'Cursiva',
	underlineLabel: 'Subrayado',
};

// --- French Locale ---

export const TEXT_FORMATTING_LOCALE_FR: TextFormattingLocale = {
	boldLabel: 'Gras',
	italicLabel: 'Italique',
	underlineLabel: 'Souligné',
};

// --- Chinese (Simplified) Locale ---

export const TEXT_FORMATTING_LOCALE_ZH: TextFormattingLocale = {
	boldLabel: '粗体',
	italicLabel: '斜体',
	underlineLabel: '下划线',
};

// --- Russian Locale ---

export const TEXT_FORMATTING_LOCALE_RU: TextFormattingLocale = {
	boldLabel: 'Жирный',
	italicLabel: 'Курсив',
	underlineLabel: 'Подчёркнутый',
};

// --- Arabic Locale ---

export const TEXT_FORMATTING_LOCALE_AR: TextFormattingLocale = {
	boldLabel: 'غامق',
	italicLabel: 'مائل',
	underlineLabel: 'تحته خط',
};

// --- Hindi Locale ---

export const TEXT_FORMATTING_LOCALE_HI: TextFormattingLocale = {
	boldLabel: 'बोल्ड',
	italicLabel: 'इटैलिक',
	underlineLabel: 'अंडरलाइन',
};

// --- Locale Map ---

export const TEXT_FORMATTING_LOCALES: Record<string, TextFormattingLocale> = {
	en: TEXT_FORMATTING_LOCALE_EN,
	de: TEXT_FORMATTING_LOCALE_DE,
	es: TEXT_FORMATTING_LOCALE_ES,
	fr: TEXT_FORMATTING_LOCALE_FR,
	zh: TEXT_FORMATTING_LOCALE_ZH,
	ru: TEXT_FORMATTING_LOCALE_RU,
	ar: TEXT_FORMATTING_LOCALE_AR,
	hi: TEXT_FORMATTING_LOCALE_HI,
};
