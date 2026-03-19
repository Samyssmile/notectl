import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) => `تم اللصق ككتلة كود ${language} مع تمييز بناء الجملة.`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} فقر${textCount > 1 ? 'ات' : 'ة'}`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join('، ');
			parts.push(`${codeCount} كتل${codeCount > 1 ? 'ة' : ''} كود (${langList})`);
		}
		return `تم اللصق كـ ${parts.join(' و ')}.`;
	},
};

export default locale;
