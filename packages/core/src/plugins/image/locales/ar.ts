import type { ImageLocale } from '../ImageLocale.js';

const locale: ImageLocale = {
	insertImage: '\u0625\u062f\u0631\u0627\u062c \u0635\u0648\u0631\u0629',
	insertImageTooltip: '\u0625\u062f\u0631\u0627\u062c \u0635\u0648\u0631\u0629',
	uploadFromComputer: '\u0631\u0641\u0639 \u0645\u0646 \u0627\u0644\u062d\u0627\u0633\u0648\u0628',
	uploadAria:
		'\u0631\u0641\u0639 \u0635\u0648\u0631\u0629 \u0645\u0646 \u0627\u0644\u062d\u0627\u0633\u0648\u0628',
	separator: '\u0623\u0648',
	urlPlaceholder: 'https://...',
	urlAria: '\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631\u0629',
	insertButton: '\u0625\u062f\u0631\u0627\u062c',
	insertAria: '\u0625\u062f\u0631\u0627\u062c \u0635\u0648\u0631\u0629',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || '\u0635\u0648\u0631\u0629'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} \u00d7 ${height} \u0628\u0643\u0633\u0644`);
		}
		return parts.join('\u060c ');
	},
	resetToNaturalSize:
		'\u062a\u0645\u062a \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0635\u0648\u0631\u0629 \u0625\u0644\u0649 \u062d\u062c\u0645\u0647\u0627 \u0627\u0644\u0637\u0628\u064a\u0639\u064a.',
	uploadFailed: '\u0641\u0634\u0644 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629.',
};

export default locale;
