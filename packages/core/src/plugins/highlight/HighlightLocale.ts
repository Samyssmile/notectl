/** Locale interface and default English locale for the HighlightPlugin. */

// --- Locale Interface ---

export interface HighlightLocale {
	readonly label: string;
	readonly tooltip: string;
	readonly resetLabel: string;
	readonly ariaLabelPrefix: string;
}

// --- Default English Locale ---

export const HIGHLIGHT_LOCALE_EN: HighlightLocale = {
	label: 'Highlight',
	tooltip: 'Highlight Color',
	resetLabel: 'None',
	ariaLabelPrefix: 'Highlight color',
};

// --- German Locale ---

export const HIGHLIGHT_LOCALE_DE: HighlightLocale = {
	label: 'Hervorhebung',
	tooltip: 'Hervorhebungsfarbe',
	resetLabel: 'Keine',
	ariaLabelPrefix: 'Hervorhebungsfarbe',
};

// --- Spanish Locale ---

export const HIGHLIGHT_LOCALE_ES: HighlightLocale = {
	label: 'Resaltado',
	tooltip: 'Color de resaltado',
	resetLabel: 'Ninguno',
	ariaLabelPrefix: 'Color de resaltado',
};

// --- French Locale ---

export const HIGHLIGHT_LOCALE_FR: HighlightLocale = {
	label: 'Surlignage',
	tooltip: 'Couleur de surlignage',
	resetLabel: 'Aucun',
	ariaLabelPrefix: 'Couleur de surlignage',
};

// --- Chinese (Simplified) Locale ---

export const HIGHLIGHT_LOCALE_ZH: HighlightLocale = {
	label: '高亮',
	tooltip: '高亮颜色',
	resetLabel: '无',
	ariaLabelPrefix: '高亮颜色',
};

// --- Russian Locale ---

export const HIGHLIGHT_LOCALE_RU: HighlightLocale = {
	label: 'Выделение',
	tooltip: 'Цвет выделения',
	resetLabel: 'Нет',
	ariaLabelPrefix: 'Цвет выделения',
};

// --- Arabic Locale ---

export const HIGHLIGHT_LOCALE_AR: HighlightLocale = {
	label: 'تمييز',
	tooltip: 'لون التمييز',
	resetLabel: 'بدون',
	ariaLabelPrefix: 'لون التمييز',
};

// --- Hindi Locale ---

export const HIGHLIGHT_LOCALE_HI: HighlightLocale = {
	label: 'हाइलाइट',
	tooltip: 'हाइलाइट रंग',
	resetLabel: 'कोई नहीं',
	ariaLabelPrefix: 'हाइलाइट रंग',
};

// --- Locale Map ---

export const HIGHLIGHT_LOCALES: Record<string, HighlightLocale> = {
	en: HIGHLIGHT_LOCALE_EN,
	de: HIGHLIGHT_LOCALE_DE,
	es: HIGHLIGHT_LOCALE_ES,
	fr: HIGHLIGHT_LOCALE_FR,
	zh: HIGHLIGHT_LOCALE_ZH,
	ru: HIGHLIGHT_LOCALE_RU,
	ar: HIGHLIGHT_LOCALE_AR,
	hi: HIGHLIGHT_LOCALE_HI,
};
