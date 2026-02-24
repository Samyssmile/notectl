/** Locale interface and default English locale for the ToolbarPlugin. */

// --- Locale Interface ---

export interface ToolbarLocale {
	readonly formattingOptionsAria: string;
}

// --- Default English Locale ---

export const TOOLBAR_LOCALE_EN: ToolbarLocale = {
	formattingOptionsAria: 'Formatting options',
};

// --- German Locale ---

export const TOOLBAR_LOCALE_DE: ToolbarLocale = {
	formattingOptionsAria: 'Formatierungsoptionen',
};

// --- Spanish Locale ---

export const TOOLBAR_LOCALE_ES: ToolbarLocale = {
	formattingOptionsAria: 'Opciones de formato',
};

// --- French Locale ---

export const TOOLBAR_LOCALE_FR: ToolbarLocale = {
	formattingOptionsAria: 'Options de mise en forme',
};

// --- Chinese (Simplified) Locale ---

export const TOOLBAR_LOCALE_ZH: ToolbarLocale = {
	formattingOptionsAria: '格式选项',
};

// --- Russian Locale ---

export const TOOLBAR_LOCALE_RU: ToolbarLocale = {
	formattingOptionsAria: 'Параметры форматирования',
};

// --- Arabic Locale ---

export const TOOLBAR_LOCALE_AR: ToolbarLocale = {
	formattingOptionsAria: 'خيارات التنسيق',
};

// --- Hindi Locale ---

export const TOOLBAR_LOCALE_HI: ToolbarLocale = {
	formattingOptionsAria: 'फ़ॉर्मेटिंग विकल्प',
};

// --- Locale Map ---

export const TOOLBAR_LOCALES: Record<string, ToolbarLocale> = {
	en: TOOLBAR_LOCALE_EN,
	de: TOOLBAR_LOCALE_DE,
	es: TOOLBAR_LOCALE_ES,
	fr: TOOLBAR_LOCALE_FR,
	zh: TOOLBAR_LOCALE_ZH,
	ru: TOOLBAR_LOCALE_RU,
	ar: TOOLBAR_LOCALE_AR,
	hi: TOOLBAR_LOCALE_HI,
};
