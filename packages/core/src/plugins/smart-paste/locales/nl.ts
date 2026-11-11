import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Geplakt als ${language}-codeblok met syntaxismarkering.`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(textCount === 1 ? '1 paragraaf' : `${textCount} paragrafen`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join(', ');
			const codeLabel: string = codeCount === 1 ? '1 codeblok' : `${codeCount} codeblokken`;
			parts.push(`${codeLabel} (${langList})`);
		}
		return `Geplakt als ${parts.join(' en ')}.`;
	},
};

export default locale;
