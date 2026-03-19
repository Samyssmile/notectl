import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Collé en tant que bloc de code ${language} avec coloration syntaxique.`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} paragraphe${textCount > 1 ? 's' : ''}`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join(', ');
			parts.push(`${codeCount} bloc${codeCount > 1 ? 's' : ''} de code (${langList})`);
		}
		return `Collé en tant que ${parts.join(' et ')}.`;
	},
};

export default locale;
