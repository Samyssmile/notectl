/**
 * Locale interface and default English locale for the SuperSubPlugin.
 */

// --- Locale Interface ---

export interface SuperSubLocale {
	readonly superscriptLabel: string;
	readonly superscriptTooltip: (shortcut: string) => string;
	readonly subscriptLabel: string;
	readonly subscriptTooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const SUPER_SUB_LOCALE_EN: SuperSubLocale = {
	superscriptLabel: 'Superscript',
	superscriptTooltip: (shortcut: string) => `Superscript (${shortcut})`,
	subscriptLabel: 'Subscript',
	subscriptTooltip: (shortcut: string) => `Subscript (${shortcut})`,
};

// --- German Locale ---

export const SUPER_SUB_LOCALE_DE: SuperSubLocale = {
	superscriptLabel: 'Hochgestellt',
	superscriptTooltip: (shortcut: string) => `Hochgestellt (${shortcut})`,
	subscriptLabel: 'Tiefgestellt',
	subscriptTooltip: (shortcut: string) => `Tiefgestellt (${shortcut})`,
};

// --- Spanish Locale ---

export const SUPER_SUB_LOCALE_ES: SuperSubLocale = {
	superscriptLabel: 'Superíndice',
	superscriptTooltip: (shortcut: string) => `Superíndice (${shortcut})`,
	subscriptLabel: 'Subíndice',
	subscriptTooltip: (shortcut: string) => `Subíndice (${shortcut})`,
};

// --- French Locale ---

export const SUPER_SUB_LOCALE_FR: SuperSubLocale = {
	superscriptLabel: 'Exposant',
	superscriptTooltip: (shortcut: string) => `Exposant (${shortcut})`,
	subscriptLabel: 'Indice',
	subscriptTooltip: (shortcut: string) => `Indice (${shortcut})`,
};

// --- Chinese (Simplified) Locale ---

export const SUPER_SUB_LOCALE_ZH: SuperSubLocale = {
	superscriptLabel: '上标',
	superscriptTooltip: (shortcut: string) => `上标 (${shortcut})`,
	subscriptLabel: '下标',
	subscriptTooltip: (shortcut: string) => `下标 (${shortcut})`,
};

// --- Russian Locale ---

export const SUPER_SUB_LOCALE_RU: SuperSubLocale = {
	superscriptLabel: 'Надстрочный',
	superscriptTooltip: (shortcut: string) => `Надстрочный (${shortcut})`,
	subscriptLabel: 'Подстрочный',
	subscriptTooltip: (shortcut: string) => `Подстрочный (${shortcut})`,
};

// --- Arabic Locale ---

export const SUPER_SUB_LOCALE_AR: SuperSubLocale = {
	superscriptLabel: 'مرتفع',
	superscriptTooltip: (shortcut: string) => `مرتفع (${shortcut})`,
	subscriptLabel: 'منخفض',
	subscriptTooltip: (shortcut: string) => `منخفض (${shortcut})`,
};

// --- Hindi Locale ---

export const SUPER_SUB_LOCALE_HI: SuperSubLocale = {
	superscriptLabel: 'सुपरस्क्रिप्ट',
	superscriptTooltip: (shortcut: string) => `सुपरस्क्रिप्ट (${shortcut})`,
	subscriptLabel: 'सबस्क्रिप्ट',
	subscriptTooltip: (shortcut: string) => `सबस्क्रिप्ट (${shortcut})`,
};

// --- Locale Map ---

export const SUPER_SUB_LOCALES: Record<string, SuperSubLocale> = {
	en: SUPER_SUB_LOCALE_EN,
	de: SUPER_SUB_LOCALE_DE,
	es: SUPER_SUB_LOCALE_ES,
	fr: SUPER_SUB_LOCALE_FR,
	zh: SUPER_SUB_LOCALE_ZH,
	ru: SUPER_SUB_LOCALE_RU,
	ar: SUPER_SUB_LOCALE_AR,
	hi: SUPER_SUB_LOCALE_HI,
};
