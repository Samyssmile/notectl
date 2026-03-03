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
	uploading: '\u0905\u092a\u0932\u094b\u0921 \u0939\u094b \u0930\u0939\u093e \u0939\u0948...',
	resizeHandleLabel: (position: string) => {
		const positions: Record<string, string> = {
			'top-left': '\u090a\u092a\u0930 \u092c\u093e\u090f\u0901',
			'top-right': '\u090a\u092a\u0930 \u0926\u093e\u090f\u0901',
			'bottom-left': '\u0928\u0940\u091a\u0947 \u092c\u093e\u090f\u0901',
			'bottom-right': '\u0928\u0940\u091a\u0947 \u0926\u093e\u090f\u0901',
		};
		return `\u0906\u0915\u093e\u0930 \u092c\u0926\u0932\u0947\u0902 ${positions[position] ?? position}`;
	},
	imageSelected: '\u091a\u093f\u0924\u094d\u0930 \u091a\u092f\u0928\u093f\u0924\u0964',
	altTextPrefix: '\u0935\u0948\u0915\u0932\u094d\u092a\u093f\u0915 \u092a\u093e\u0920: ',
	imageSizeAnnounce: (w: number, h: number) =>
		`\u0906\u0915\u093e\u0930: ${w} x ${h} \u092a\u093f\u0915\u094d\u0938\u0947\u0932\u0964`,
	resizeHint: (shrink: string, grow: string) =>
		`${shrink} / ${grow} \u0906\u0915\u093e\u0930 \u092c\u0926\u0932\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f\u0964`,
	imageResized: (w: number, h: number) =>
		`\u091a\u093f\u0924\u094d\u0930 \u0915\u093e \u0906\u0915\u093e\u0930 ${w} x ${h} \u092a\u093f\u0915\u094d\u0938\u0947\u0932 \u092e\u0947\u0902 \u092c\u0926\u0932\u093e \u0917\u092f\u093e\u0964`,
	keyboardResizeHint: (shrink: string, grow: string) =>
		`${shrink} / ${grow} \u0906\u0915\u093e\u0930 \u092c\u0926\u0932\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f`,
};

export default locale;
