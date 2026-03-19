import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Pegado como bloque de código ${language} con resaltado de sintaxis.`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} párrafo${textCount > 1 ? 's' : ''}`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join(', ');
			parts.push(`${codeCount} bloque${codeCount > 1 ? 's' : ''} de código (${langList})`);
		}
		return `Pegado como ${parts.join(' y ')}.`;
	},
};

export default locale;
