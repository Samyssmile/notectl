import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Colado como bloco de código ${language} com destaque de sintaxe.`,
};

export default locale;
