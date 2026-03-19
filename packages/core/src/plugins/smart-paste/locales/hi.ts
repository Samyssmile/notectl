import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`${language} कोड ब्लॉक के रूप में सिंटैक्स हाइलाइटिंग के साथ पेस्ट किया गया।`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} पैराग्राफ`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join(', ');
			parts.push(`${codeCount} कोड ब्लॉक (${langList})`);
		}
		return `${parts.join(' और ')} के रूप में पेस्ट किया गया।`;
	},
};

export default locale;
