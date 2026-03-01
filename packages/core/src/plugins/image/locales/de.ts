import type { ImageLocale } from '../ImageLocale.js';

const locale: ImageLocale = {
	insertImage: 'Bild einf\u00fcgen',
	insertImageTooltip: 'Bild einf\u00fcgen',
	uploadFromComputer: 'Vom Computer hochladen',
	uploadAria: 'Bild vom Computer hochladen',
	separator: 'oder',
	urlPlaceholder: 'https://...',
	urlAria: 'Bild-URL',
	insertButton: 'Einf\u00fcgen',
	insertAria: 'Bild einf\u00fcgen',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Bild'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} mal ${height} Pixel`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Bild auf Originalgr\u00f6\u00dfe zur\u00fcckgesetzt.',
	uploadFailed: 'Bild-Upload fehlgeschlagen.',
};

export default locale;
