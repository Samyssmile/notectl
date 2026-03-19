import type { SmartPasteLocale } from '../SmartPasteLocale.js';

const locale: SmartPasteLocale = {
	detectedAsCodeBlock: (language: string) =>
		`Вставлено как блок кода ${language} с подсветкой синтаксиса.`,
	detectedMixedContent: (textCount: number, codeCount: number, languages: readonly string[]) => {
		const parts: string[] = [];
		if (textCount > 0) {
			parts.push(`${textCount} абзац${textCount > 1 ? 'ов' : ''}`);
		}
		if (codeCount > 0) {
			const langList: string = languages.join(', ');
			parts.push(`${codeCount} блок${codeCount > 1 ? 'ов' : ''} кода (${langList})`);
		}
		return `Вставлено как ${parts.join(' и ')}.`;
	},
};

export default locale;
