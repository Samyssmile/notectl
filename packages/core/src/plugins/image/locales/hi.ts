import type { ImageLocale } from '../ImageLocale.js';

const locale: ImageLocale = {
	insertImage: '\u091a\u093f\u0924\u094d\u0930 \u0921\u093e\u0932\u0947\u0902',
	insertImageTooltip: '\u091a\u093f\u0924\u094d\u0930 \u0921\u093e\u0932\u0947\u0902',
	uploadFromComputer:
		'\u0915\u0902\u092a\u094d\u092f\u0942\u091f\u0930 \u0938\u0947 \u0905\u092a\u0932\u094b\u0921 \u0915\u0930\u0947\u0902',
	uploadAria:
		'\u0915\u0902\u092a\u094d\u092f\u0942\u091f\u0930 \u0938\u0947 \u091a\u093f\u0924\u094d\u0930 \u0905\u092a\u0932\u094b\u0921 \u0915\u0930\u0947\u0902',
	separator: '\u092f\u093e',
	urlPlaceholder: 'https://...',
	urlAria: '\u091a\u093f\u0924\u094d\u0930 URL',
	insertButton: '\u0921\u093e\u0932\u0947\u0902',
	insertAria: '\u091a\u093f\u0924\u094d\u0930 \u0921\u093e\u0932\u0947\u0902',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || '\u091a\u093f\u0924\u094d\u0930'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} x ${height} \u092a\u093f\u0915\u094d\u0938\u0947\u0932`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize:
		'\u091a\u093f\u0924\u094d\u0930 \u092e\u0942\u0932 \u0906\u0915\u093e\u0930 \u092e\u0947\u0902 \u092a\u0941\u0928\u0930\u094d\u0938\u094d\u0925\u093e\u092a\u093f\u0924\u0964',
	uploadFailed:
		'\u091a\u093f\u0924\u094d\u0930 \u0905\u092a\u0932\u094b\u0921 \u0935\u093f\u092b\u0932\u0964',
};

export default locale;
