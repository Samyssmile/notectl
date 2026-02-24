/**
 * Locale interface and default English locale for the ListPlugin.
 */

// --- Locale Interface ---

export interface ListLocale {
	readonly bulletList: string;
	readonly numberedList: string;
	readonly checklist: string;
}

// --- Default English Locale ---

export const LIST_LOCALE_EN: ListLocale = {
	bulletList: 'Bullet List',
	numberedList: 'Numbered List',
	checklist: 'Checklist',
};

// --- German Locale ---

export const LIST_LOCALE_DE: ListLocale = {
	bulletList: 'Aufzählung',
	numberedList: 'Nummerierte Liste',
	checklist: 'Checkliste',
};

// --- Spanish Locale ---

export const LIST_LOCALE_ES: ListLocale = {
	bulletList: 'Lista con viñetas',
	numberedList: 'Lista numerada',
	checklist: 'Lista de verificación',
};

// --- French Locale ---

export const LIST_LOCALE_FR: ListLocale = {
	bulletList: 'Liste à puces',
	numberedList: 'Liste numérotée',
	checklist: 'Liste de contrôle',
};

// --- Chinese (Simplified) Locale ---

export const LIST_LOCALE_ZH: ListLocale = {
	bulletList: '无序列表',
	numberedList: '有序列表',
	checklist: '清单',
};

// --- Russian Locale ---

export const LIST_LOCALE_RU: ListLocale = {
	bulletList: 'Маркированный список',
	numberedList: 'Нумерованный список',
	checklist: 'Чек-лист',
};

// --- Arabic Locale ---

export const LIST_LOCALE_AR: ListLocale = {
	bulletList: 'قائمة نقطية',
	numberedList: 'قائمة مرقمة',
	checklist: 'قائمة تحقق',
};

// --- Hindi Locale ---

export const LIST_LOCALE_HI: ListLocale = {
	bulletList: 'बुलेट सूची',
	numberedList: 'क्रमांकित सूची',
	checklist: 'चेकलिस्ट',
};

// --- Locale Map ---

export const LIST_LOCALES: Record<string, ListLocale> = {
	en: LIST_LOCALE_EN,
	de: LIST_LOCALE_DE,
	es: LIST_LOCALE_ES,
	fr: LIST_LOCALE_FR,
	zh: LIST_LOCALE_ZH,
	ru: LIST_LOCALE_RU,
	ar: LIST_LOCALE_AR,
	hi: LIST_LOCALE_HI,
};
