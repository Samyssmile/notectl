/** Locale interface and default English locale for the FontSizePlugin. */

// --- Locale Interface ---

export interface FontSizeLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly customFontSizeAria: string;
	readonly fontSizesAria: string;
}

// --- Default English Locale ---

export const FONT_SIZE_LOCALE_EN: FontSizeLocale = {
	label: 'Font Size',
	tooltip: 'Font Size',
	customFontSizeAria: 'Custom font size',
	fontSizesAria: 'Font sizes',
};

// --- German Locale ---

export const FONT_SIZE_LOCALE_DE: FontSizeLocale = {
	label: 'Schriftgröße',
	tooltip: 'Schriftgröße',
	customFontSizeAria: 'Benutzerdefinierte Schriftgröße',
	fontSizesAria: 'Schriftgrößen',
};

// --- Spanish Locale ---

export const FONT_SIZE_LOCALE_ES: FontSizeLocale = {
	label: 'Tamaño de fuente',
	tooltip: 'Tamaño de fuente',
	customFontSizeAria: 'Tamaño de fuente personalizado',
	fontSizesAria: 'Tamaños de fuente',
};

// --- French Locale ---

export const FONT_SIZE_LOCALE_FR: FontSizeLocale = {
	label: 'Taille de police',
	tooltip: 'Taille de police',
	customFontSizeAria: 'Taille de police personnalisée',
	fontSizesAria: 'Tailles de police',
};

// --- Chinese (Simplified) Locale ---

export const FONT_SIZE_LOCALE_ZH: FontSizeLocale = {
	label: '字号',
	tooltip: '字号',
	customFontSizeAria: '自定义字号',
	fontSizesAria: '字号列表',
};

// --- Russian Locale ---

export const FONT_SIZE_LOCALE_RU: FontSizeLocale = {
	label: 'Размер шрифта',
	tooltip: 'Размер шрифта',
	customFontSizeAria: 'Произвольный размер шрифта',
	fontSizesAria: 'Размеры шрифта',
};

// --- Arabic Locale ---

export const FONT_SIZE_LOCALE_AR: FontSizeLocale = {
	label: 'حجم الخط',
	tooltip: 'حجم الخط',
	customFontSizeAria: 'حجم خط مخصص',
	fontSizesAria: 'أحجام الخط',
};

// --- Hindi Locale ---

export const FONT_SIZE_LOCALE_HI: FontSizeLocale = {
	label: 'फ़ॉन्ट आकार',
	tooltip: 'फ़ॉन्ट आकार',
	customFontSizeAria: 'कस्टम फ़ॉन्ट आकार',
	fontSizesAria: 'फ़ॉन्ट आकार सूची',
};

// --- Locale Map ---

export const FONT_SIZE_LOCALES: Record<string, FontSizeLocale> = {
	en: FONT_SIZE_LOCALE_EN,
	de: FONT_SIZE_LOCALE_DE,
	es: FONT_SIZE_LOCALE_ES,
	fr: FONT_SIZE_LOCALE_FR,
	zh: FONT_SIZE_LOCALE_ZH,
	ru: FONT_SIZE_LOCALE_RU,
	ar: FONT_SIZE_LOCALE_AR,
	hi: FONT_SIZE_LOCALE_HI,
};
