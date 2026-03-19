import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) => `已粘贴为带语法高亮的 ${language} 代码块。`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} 个段落`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join('、');
			parts.push(`${codeCount} 个代码块（${langList}）`);
		}
		return `已粘贴为${parts.join('和')}。`;
	},
};

export default locale;
