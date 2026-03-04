import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Collé en tant que bloc de code ${language} avec coloration syntaxique.`,
};

export default locale;
