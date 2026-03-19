import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Colado como bloco de código ${language} com destaque de sintaxe.`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} parágrafo${textCount > 1 ? 's' : ''}`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join(', ');
			parts.push(`${codeCount} bloco${codeCount > 1 ? 's' : ''} de código (${langList})`);
		}
		return `Colado como ${parts.join(' e ')}.`;
	},
};

export default locale;
