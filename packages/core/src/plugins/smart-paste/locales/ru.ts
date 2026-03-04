import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Вставлено как блок кода ${language} с подсветкой синтаксиса.`,
};

export default locale;
