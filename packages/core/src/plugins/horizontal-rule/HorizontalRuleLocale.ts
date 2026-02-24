/** Locale interface and default English locale for the HorizontalRulePlugin. */

// --- Locale Interface ---

export interface HorizontalRuleLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const HORIZONTAL_RULE_LOCALE_EN: HorizontalRuleLocale = {
	label: 'Horizontal Rule',
	tooltip: (shortcut: string) => `Horizontal Rule (${shortcut})`,
};

// --- German Locale ---

export const HORIZONTAL_RULE_LOCALE_DE: HorizontalRuleLocale = {
	label: 'Trennlinie',
	tooltip: (shortcut: string) => `Trennlinie (${shortcut})`,
};

// --- Spanish Locale ---

export const HORIZONTAL_RULE_LOCALE_ES: HorizontalRuleLocale = {
	label: 'Línea horizontal',
	tooltip: (shortcut: string) => `Línea horizontal (${shortcut})`,
};

// --- French Locale ---

export const HORIZONTAL_RULE_LOCALE_FR: HorizontalRuleLocale = {
	label: 'Ligne horizontale',
	tooltip: (shortcut: string) => `Ligne horizontale (${shortcut})`,
};

// --- Chinese (Simplified) Locale ---

export const HORIZONTAL_RULE_LOCALE_ZH: HorizontalRuleLocale = {
	label: '分隔线',
	tooltip: (shortcut: string) => `分隔线 (${shortcut})`,
};

// --- Russian Locale ---

export const HORIZONTAL_RULE_LOCALE_RU: HorizontalRuleLocale = {
	label: 'Горизонтальная линия',
	tooltip: (shortcut: string) => `Горизонтальная линия (${shortcut})`,
};

// --- Arabic Locale ---

export const HORIZONTAL_RULE_LOCALE_AR: HorizontalRuleLocale = {
	label: 'خط أفقي',
	tooltip: (shortcut: string) => `خط أفقي (${shortcut})`,
};

// --- Hindi Locale ---

export const HORIZONTAL_RULE_LOCALE_HI: HorizontalRuleLocale = {
	label: 'क्षैतिज रेखा',
	tooltip: (shortcut: string) => `क्षैतिज रेखा (${shortcut})`,
};

// --- Locale Map ---

export const HORIZONTAL_RULE_LOCALES: Record<string, HorizontalRuleLocale> = {
	en: HORIZONTAL_RULE_LOCALE_EN,
	de: HORIZONTAL_RULE_LOCALE_DE,
	es: HORIZONTAL_RULE_LOCALE_ES,
	fr: HORIZONTAL_RULE_LOCALE_FR,
	zh: HORIZONTAL_RULE_LOCALE_ZH,
	ru: HORIZONTAL_RULE_LOCALE_RU,
	ar: HORIZONTAL_RULE_LOCALE_AR,
	hi: HORIZONTAL_RULE_LOCALE_HI,
};
