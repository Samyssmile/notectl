/** Locale interface and default English locale for the SmartPastePlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

export interface SmartPasteLocale {
	readonly detectedAsCodeBlock: (language: string) => string;
	readonly detectedMixedContent: (
		textCount: number,
		codeCount: number,
		languages: readonly string[],
	) => string;
}

export const SMART_PASTE_LOCALE_EN: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Pasted as ${language} code block with syntax highlighting.`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} paragraph${textCount > 1 ? 's' : ''}`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join(', ');
			parts.push(`${codeCount} code block${codeCount > 1 ? 's' : ''} (${langList})`);
		}
		return `Pasted as ${parts.join(' and ')}.`;
	},
};

const localeModules: LocaleModuleMap<SmartPasteLocale> = import.meta.glob<{
	default: SmartPasteLocale;
}>('./locales/*.ts', { eager: false });

export async function loadSmartPasteLocale(lang: string): Promise<SmartPasteLocale> {
	return loadLocaleModule(localeModules, lang, SMART_PASTE_LOCALE_EN);
}
