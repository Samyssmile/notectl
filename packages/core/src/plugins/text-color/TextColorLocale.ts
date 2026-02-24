/** Locale interface and default English locale for the TextColorPlugin. */

// --- Locale Interface ---

export interface TextColorLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly resetLabel: string;
	readonly ariaLabelPrefix: string;
}

// --- Default English Locale ---

export const TEXT_COLOR_LOCALE_EN: TextColorLocale = {
	label: 'Text Color',
	tooltip: 'Text Color',
	resetLabel: 'Default',
	ariaLabelPrefix: 'Text color',
};

// --- German Locale ---

export const TEXT_COLOR_LOCALE_DE: TextColorLocale = {
	label: 'Textfarbe',
	tooltip: 'Textfarbe',
	resetLabel: 'Standard',
	ariaLabelPrefix: 'Textfarbe',
};

// --- Spanish Locale ---

export const TEXT_COLOR_LOCALE_ES: TextColorLocale = {
	label: 'Color de texto',
	tooltip: 'Color de texto',
	resetLabel: 'Predeterminado',
	ariaLabelPrefix: 'Color de texto',
};

// --- French Locale ---

export const TEXT_COLOR_LOCALE_FR: TextColorLocale = {
	label: 'Couleur du texte',
	tooltip: 'Couleur du texte',
	resetLabel: 'Par défaut',
	ariaLabelPrefix: 'Couleur du texte',
};

// --- Chinese (Simplified) Locale ---

export const TEXT_COLOR_LOCALE_ZH: TextColorLocale = {
	label: '文字颜色',
	tooltip: '文字颜色',
	resetLabel: '默认',
	ariaLabelPrefix: '文字颜色',
};

// --- Russian Locale ---

export const TEXT_COLOR_LOCALE_RU: TextColorLocale = {
	label: 'Цвет текста',
	tooltip: 'Цвет текста',
	resetLabel: 'По умолчанию',
	ariaLabelPrefix: 'Цвет текста',
};

// --- Arabic Locale ---

export const TEXT_COLOR_LOCALE_AR: TextColorLocale = {
	label: 'لون النص',
	tooltip: 'لون النص',
	resetLabel: 'افتراضي',
	ariaLabelPrefix: 'لون النص',
};

// --- Hindi Locale ---

export const TEXT_COLOR_LOCALE_HI: TextColorLocale = {
	label: 'टेक्स्ट रंग',
	tooltip: 'टेक्स्ट रंग',
	resetLabel: 'डिफ़ॉल्ट',
	ariaLabelPrefix: 'टेक्स्ट रंग',
};

// --- Locale Map ---

export const TEXT_COLOR_LOCALES: Record<string, TextColorLocale> = {
	en: TEXT_COLOR_LOCALE_EN,
	de: TEXT_COLOR_LOCALE_DE,
	es: TEXT_COLOR_LOCALE_ES,
	fr: TEXT_COLOR_LOCALE_FR,
	zh: TEXT_COLOR_LOCALE_ZH,
	ru: TEXT_COLOR_LOCALE_RU,
	ar: TEXT_COLOR_LOCALE_AR,
	hi: TEXT_COLOR_LOCALE_HI,
};
