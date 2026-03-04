import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Pegado como bloque de código ${language} con resaltado de sintaxis.`,
};

export default locale;
