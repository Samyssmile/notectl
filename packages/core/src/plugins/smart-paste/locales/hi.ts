import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`${language} कोड ब्लॉक के रूप में सिंटैक्स हाइलाइटिंग के साथ पेस्ट किया गया।`,
};

export default locale;
