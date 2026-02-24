/** Locale interface and default English locale for the FontPlugin. */

// --- Locale Interface ---

export interface FontLocale {
	readonly label: string;
	readonly tooltip: string;
}

// --- Default English Locale ---

export const FONT_LOCALE_EN: FontLocale = {
	label: 'Font',
	tooltip: 'Font Family',
};

// --- German Locale ---

export const FONT_LOCALE_DE: FontLocale = {
	label: 'Schriftart',
	tooltip: 'Schriftfamilie',
};

// --- Spanish Locale ---

export const FONT_LOCALE_ES: FontLocale = {
	label: 'Fuente',
	tooltip: 'Familia de fuente',
};

// --- French Locale ---

export const FONT_LOCALE_FR: FontLocale = {
	label: 'Police',
	tooltip: 'Famille de police',
};

// --- Chinese (Simplified) Locale ---

export const FONT_LOCALE_ZH: FontLocale = {
	label: '字体',
	tooltip: '字体系列',
};

// --- Russian Locale ---

export const FONT_LOCALE_RU: FontLocale = {
	label: 'Шрифт',
	tooltip: 'Семейство шрифтов',
};

// --- Arabic Locale ---

export const FONT_LOCALE_AR: FontLocale = {
	label: 'الخط',
	tooltip: 'عائلة الخط',
};

// --- Hindi Locale ---

export const FONT_LOCALE_HI: FontLocale = {
	label: 'फ़ॉन्ट',
	tooltip: 'फ़ॉन्ट परिवार',
};

// --- Locale Map ---

export const FONT_LOCALES: Record<string, FontLocale> = {
	en: FONT_LOCALE_EN,
	de: FONT_LOCALE_DE,
	es: FONT_LOCALE_ES,
	fr: FONT_LOCALE_FR,
	zh: FONT_LOCALE_ZH,
	ru: FONT_LOCALE_RU,
	ar: FONT_LOCALE_AR,
	hi: FONT_LOCALE_HI,
};
