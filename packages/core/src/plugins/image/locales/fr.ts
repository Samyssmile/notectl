import type { ImageLocale } from '../ImageLocale.js';

const locale: ImageLocale = {
	insertImage: 'Ins\u00e9rer une image',
	insertImageTooltip: 'Ins\u00e9rer une image',
	uploadFromComputer: 'T\u00e9l\u00e9charger depuis l\u2019ordinateur',
	uploadAria: 'T\u00e9l\u00e9charger une image depuis l\u2019ordinateur',
	separator: 'ou',
	urlPlaceholder: 'https://...',
	urlAria: 'URL de l\u2019image',
	insertButton: 'Ins\u00e9rer',
	insertAria: 'Ins\u00e9rer une image',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Image'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} par ${height} pixels`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Image r\u00e9tablie \u00e0 sa taille d\u2019origine.',
	uploadFailed: '\u00c9chec du t\u00e9l\u00e9chargement de l\u2019image.',
};

export default locale;
