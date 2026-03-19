import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Als ${language}-Codeblock mit Syntaxhervorhebung eingefügt.`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} Absatz${textCount > 1 ? 'e' : ''}`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join(', ');
			parts.push(`${codeCount} Codeblock${codeCount > 1 ? 's' : ''} (${langList})`);
		}
		return `Eingefügt als ${parts.join(' und ')}.`;
	},
};

export default locale;
