/**
 * Locale interface and default English locale for the BlockquotePlugin.
 */

// --- Locale Interface ---

export interface BlockquoteLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
}

// --- Default English Locale ---

export const BLOCKQUOTE_LOCALE_EN: BlockquoteLocale = {
	label: 'Blockquote',
	tooltip: (shortcut: string) => `Blockquote (${shortcut})`,
};

// --- German Locale ---

export const BLOCKQUOTE_LOCALE_DE: BlockquoteLocale = {
	label: 'Zitat',
	tooltip: (shortcut: string) => `Zitat (${shortcut})`,
};

// --- Spanish Locale ---

export const BLOCKQUOTE_LOCALE_ES: BlockquoteLocale = {
	label: 'Cita',
	tooltip: (shortcut: string) => `Cita (${shortcut})`,
};

// --- French Locale ---

export const BLOCKQUOTE_LOCALE_FR: BlockquoteLocale = {
	label: 'Citation',
	tooltip: (shortcut: string) => `Citation (${shortcut})`,
};

// --- Chinese (Simplified) Locale ---

export const BLOCKQUOTE_LOCALE_ZH: BlockquoteLocale = {
	label: '引用',
	tooltip: (shortcut: string) => `引用 (${shortcut})`,
};

// --- Russian Locale ---

export const BLOCKQUOTE_LOCALE_RU: BlockquoteLocale = {
	label: 'Цитата',
	tooltip: (shortcut: string) => `Цитата (${shortcut})`,
};

// --- Arabic Locale ---

export const BLOCKQUOTE_LOCALE_AR: BlockquoteLocale = {
	label: 'اقتباس',
	tooltip: (shortcut: string) => `اقتباس (${shortcut})`,
};

// --- Hindi Locale ---

export const BLOCKQUOTE_LOCALE_HI: BlockquoteLocale = {
	label: 'उद्धरण',
	tooltip: (shortcut: string) => `उद्धरण (${shortcut})`,
};

// --- Locale Map ---

export const BLOCKQUOTE_LOCALES: Record<string, BlockquoteLocale> = {
	en: BLOCKQUOTE_LOCALE_EN,
	de: BLOCKQUOTE_LOCALE_DE,
	es: BLOCKQUOTE_LOCALE_ES,
	fr: BLOCKQUOTE_LOCALE_FR,
	zh: BLOCKQUOTE_LOCALE_ZH,
	ru: BLOCKQUOTE_LOCALE_RU,
	ar: BLOCKQUOTE_LOCALE_AR,
	hi: BLOCKQUOTE_LOCALE_HI,
};
