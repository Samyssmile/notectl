/** Locale interface and default English locale for the CaretNavigationPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface CaretNavigationLocale {
	readonly paragraph: string;
	readonly heading1: string;
	readonly heading2: string;
	readonly heading3: string;
	readonly heading4: string;
	readonly heading5: string;
	readonly heading6: string;
	readonly codeBlock: string;
	readonly blockquote: string;
	readonly listItem: string;
	readonly horizontalRule: string;
	readonly image: string;
	readonly table: string;
}

// --- Default English Locale ---

export const CARET_NAVIGATION_LOCALE_EN: CaretNavigationLocale = {
	paragraph: 'Paragraph',
	heading1: 'Heading 1',
	heading2: 'Heading 2',
	heading3: 'Heading 3',
	heading4: 'Heading 4',
	heading5: 'Heading 5',
	heading6: 'Heading 6',
	codeBlock: 'Code Block',
	blockquote: 'Block Quote',
	listItem: 'List Item',
	horizontalRule: 'Horizontal Rule',
	image: 'Image',
	table: 'Table',
};

// --- Block Type → Locale Key Mapping ---

const BLOCK_TYPE_KEY_MAP: Readonly<Record<string, keyof CaretNavigationLocale>> = {
	paragraph: 'paragraph',
	code_block: 'codeBlock',
	blockquote: 'blockquote',
	list_item: 'listItem',
	horizontal_rule: 'horizontalRule',
	image: 'image',
	table: 'table',
};

/** Resolves a block type + attrs to a localized label string. */
export function resolveBlockLabel(
	locale: CaretNavigationLocale,
	typeName: string,
	attrs?: Record<string, unknown>,
): string {
	if (typeName === 'heading' && attrs?.level) {
		const key = `heading${attrs.level}` as keyof CaretNavigationLocale;
		if (key in locale) return locale[key];
	}
	const key: keyof CaretNavigationLocale | undefined = BLOCK_TYPE_KEY_MAP[typeName];
	return key ? locale[key] : typeName;
}

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<CaretNavigationLocale> = import.meta.glob<{
	default: CaretNavigationLocale;
}>('./locales/*.ts', { eager: false });

export async function loadCaretNavigationLocale(lang: string): Promise<CaretNavigationLocale> {
	return loadLocaleModule(localeModules, lang, CARET_NAVIGATION_LOCALE_EN);
}
