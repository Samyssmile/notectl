import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Als ${language}-Codeblock mit Syntaxhervorhebung eingefügt.`,
};

export default locale;
