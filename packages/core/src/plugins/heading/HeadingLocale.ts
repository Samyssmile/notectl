/**
 * Locale interface and default English locale for the HeadingPlugin.
 */

// --- Locale Interface ---

export interface HeadingLocale {
	readonly paragraph: string;
	readonly title: string;
	readonly subtitle: string;
	readonly heading1: string;
	readonly heading2: string;
	readonly heading3: string;
	readonly heading4: string;
	readonly heading5: string;
	readonly heading6: string;
	readonly blockTypeLabel: string;
	readonly blockTypesAria: string;
}

// --- Default English Locale ---

export const HEADING_LOCALE_EN: HeadingLocale = {
	paragraph: 'Paragraph',
	title: 'Title',
	subtitle: 'Subtitle',
	heading1: 'Heading 1',
	heading2: 'Heading 2',
	heading3: 'Heading 3',
	heading4: 'Heading 4',
	heading5: 'Heading 5',
	heading6: 'Heading 6',
	blockTypeLabel: 'Block Type',
	blockTypesAria: 'Block types',
};

// --- German Locale ---

export const HEADING_LOCALE_DE: HeadingLocale = {
	paragraph: 'Absatz',
	title: 'Titel',
	subtitle: 'Untertitel',
	heading1: 'Überschrift 1',
	heading2: 'Überschrift 2',
	heading3: 'Überschrift 3',
	heading4: 'Überschrift 4',
	heading5: 'Überschrift 5',
	heading6: 'Überschrift 6',
	blockTypeLabel: 'Blocktyp',
	blockTypesAria: 'Blocktypen',
};

// --- Spanish Locale ---

export const HEADING_LOCALE_ES: HeadingLocale = {
	paragraph: 'Párrafo',
	title: 'Título',
	subtitle: 'Subtítulo',
	heading1: 'Encabezado 1',
	heading2: 'Encabezado 2',
	heading3: 'Encabezado 3',
	heading4: 'Encabezado 4',
	heading5: 'Encabezado 5',
	heading6: 'Encabezado 6',
	blockTypeLabel: 'Tipo de bloque',
	blockTypesAria: 'Tipos de bloque',
};

// --- French Locale ---

export const HEADING_LOCALE_FR: HeadingLocale = {
	paragraph: 'Paragraphe',
	title: 'Titre',
	subtitle: 'Sous-titre',
	heading1: 'Titre 1',
	heading2: 'Titre 2',
	heading3: 'Titre 3',
	heading4: 'Titre 4',
	heading5: 'Titre 5',
	heading6: 'Titre 6',
	blockTypeLabel: 'Type de bloc',
	blockTypesAria: 'Types de bloc',
};

// --- Chinese (Simplified) Locale ---

export const HEADING_LOCALE_ZH: HeadingLocale = {
	paragraph: '正文',
	title: '标题',
	subtitle: '副标题',
	heading1: '一级标题',
	heading2: '二级标题',
	heading3: '三级标题',
	heading4: '四级标题',
	heading5: '五级标题',
	heading6: '六级标题',
	blockTypeLabel: '块类型',
	blockTypesAria: '块类型列表',
};

// --- Russian Locale ---

export const HEADING_LOCALE_RU: HeadingLocale = {
	paragraph: 'Абзац',
	title: 'Заголовок',
	subtitle: 'Подзаголовок',
	heading1: 'Заголовок 1',
	heading2: 'Заголовок 2',
	heading3: 'Заголовок 3',
	heading4: 'Заголовок 4',
	heading5: 'Заголовок 5',
	heading6: 'Заголовок 6',
	blockTypeLabel: 'Тип блока',
	blockTypesAria: 'Типы блоков',
};

// --- Arabic Locale ---

export const HEADING_LOCALE_AR: HeadingLocale = {
	paragraph: 'فقرة',
	title: 'عنوان',
	subtitle: 'عنوان فرعي',
	heading1: 'عنوان 1',
	heading2: 'عنوان 2',
	heading3: 'عنوان 3',
	heading4: 'عنوان 4',
	heading5: 'عنوان 5',
	heading6: 'عنوان 6',
	blockTypeLabel: 'نوع الكتلة',
	blockTypesAria: 'أنواع الكتل',
};

// --- Hindi Locale ---

export const HEADING_LOCALE_HI: HeadingLocale = {
	paragraph: 'अनुच्छेद',
	title: 'शीर्षक',
	subtitle: 'उपशीर्षक',
	heading1: 'शीर्षक 1',
	heading2: 'शीर्षक 2',
	heading3: 'शीर्षक 3',
	heading4: 'शीर्षक 4',
	heading5: 'शीर्षक 5',
	heading6: 'शीर्षक 6',
	blockTypeLabel: 'ब्लॉक प्रकार',
	blockTypesAria: 'ब्लॉक प्रकार सूची',
};

// --- Locale Map ---

export const HEADING_LOCALES: Record<string, HeadingLocale> = {
	en: HEADING_LOCALE_EN,
	de: HEADING_LOCALE_DE,
	es: HEADING_LOCALE_ES,
	fr: HEADING_LOCALE_FR,
	zh: HEADING_LOCALE_ZH,
	ru: HEADING_LOCALE_RU,
	ar: HEADING_LOCALE_AR,
	hi: HEADING_LOCALE_HI,
};
