import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) => `تم اللصق ككتلة كود ${language} مع تمييز بناء الجملة.`,
};

export default locale;
