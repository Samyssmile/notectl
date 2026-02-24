/**
 * Locale interface and default English locale for the LinkPlugin.
 */

// --- Locale Interface ---

export interface LinkLocale {
	readonly label: string;
	readonly tooltip: (shortcut: string) => string;
	readonly removeLink: string;
	readonly removeLinkAria: string;
	readonly urlPlaceholder: string;
	readonly urlAria: string;
	readonly apply: string;
	readonly applyAria: string;
}

// --- Default English Locale ---

export const LINK_LOCALE_EN: LinkLocale = {
	label: 'Link',
	tooltip: (shortcut: string) => `Insert Link (${shortcut})`,
	removeLink: 'Remove Link',
	removeLinkAria: 'Remove link',
	urlPlaceholder: 'https://...',
	urlAria: 'Link URL',
	apply: 'Apply',
	applyAria: 'Apply link',
};

// --- German Locale ---

export const LINK_LOCALE_DE: LinkLocale = {
	label: 'Link',
	tooltip: (shortcut: string) => `Link einfügen (${shortcut})`,
	removeLink: 'Link entfernen',
	removeLinkAria: 'Link entfernen',
	urlPlaceholder: 'https://...',
	urlAria: 'Link-URL',
	apply: 'Anwenden',
	applyAria: 'Link anwenden',
};

// --- Spanish Locale ---

export const LINK_LOCALE_ES: LinkLocale = {
	label: 'Enlace',
	tooltip: (shortcut: string) => `Insertar enlace (${shortcut})`,
	removeLink: 'Eliminar enlace',
	removeLinkAria: 'Eliminar enlace',
	urlPlaceholder: 'https://...',
	urlAria: 'URL del enlace',
	apply: 'Aplicar',
	applyAria: 'Aplicar enlace',
};

// --- French Locale ---

export const LINK_LOCALE_FR: LinkLocale = {
	label: 'Lien',
	tooltip: (shortcut: string) => `Insérer un lien (${shortcut})`,
	removeLink: 'Supprimer le lien',
	removeLinkAria: 'Supprimer le lien',
	urlPlaceholder: 'https://...',
	urlAria: 'URL du lien',
	apply: 'Appliquer',
	applyAria: 'Appliquer le lien',
};

// --- Chinese (Simplified) Locale ---

export const LINK_LOCALE_ZH: LinkLocale = {
	label: '链接',
	tooltip: (shortcut: string) => `插入链接 (${shortcut})`,
	removeLink: '移除链接',
	removeLinkAria: '移除链接',
	urlPlaceholder: 'https://...',
	urlAria: '链接地址',
	apply: '应用',
	applyAria: '应用链接',
};

// --- Russian Locale ---

export const LINK_LOCALE_RU: LinkLocale = {
	label: 'Ссылка',
	tooltip: (shortcut: string) => `Вставить ссылку (${shortcut})`,
	removeLink: 'Удалить ссылку',
	removeLinkAria: 'Удалить ссылку',
	urlPlaceholder: 'https://...',
	urlAria: 'URL ссылки',
	apply: 'Применить',
	applyAria: 'Применить ссылку',
};

// --- Arabic Locale ---

export const LINK_LOCALE_AR: LinkLocale = {
	label: 'رابط',
	tooltip: (shortcut: string) => `إدراج رابط (${shortcut})`,
	removeLink: 'إزالة الرابط',
	removeLinkAria: 'إزالة الرابط',
	urlPlaceholder: 'https://...',
	urlAria: 'عنوان الرابط',
	apply: 'تطبيق',
	applyAria: 'تطبيق الرابط',
};

// --- Hindi Locale ---

export const LINK_LOCALE_HI: LinkLocale = {
	label: 'लिंक',
	tooltip: (shortcut: string) => `लिंक डालें (${shortcut})`,
	removeLink: 'लिंक हटाएँ',
	removeLinkAria: 'लिंक हटाएँ',
	urlPlaceholder: 'https://...',
	urlAria: 'लिंक URL',
	apply: 'लागू करें',
	applyAria: 'लिंक लागू करें',
};

// --- Locale Map ---

export const LINK_LOCALES: Record<string, LinkLocale> = {
	en: LINK_LOCALE_EN,
	de: LINK_LOCALE_DE,
	es: LINK_LOCALE_ES,
	fr: LINK_LOCALE_FR,
	zh: LINK_LOCALE_ZH,
	ru: LINK_LOCALE_RU,
	ar: LINK_LOCALE_AR,
	hi: LINK_LOCALE_HI,
};
