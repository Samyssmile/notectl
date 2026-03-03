import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) => `已粘贴为带语法高亮的 ${language} 代码块。`,
};

export default locale;
