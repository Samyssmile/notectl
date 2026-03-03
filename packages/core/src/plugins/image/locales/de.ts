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
	uploading: 'Wird hochgeladen...',
	resizeHandleLabel: (position: string) => {
		const positions: Record<string, string> = {
			'top-left': 'oben links',
			'top-right': 'oben rechts',
			'bottom-left': 'unten links',
			'bottom-right': 'unten rechts',
		};
		return `Gr\u00f6\u00dfe \u00e4ndern ${positions[position] ?? position}`;
	},
	imageSelected: 'Bild ausgew\u00e4hlt.',
	altTextPrefix: 'Alternativtext: ',
	imageSizeAnnounce: (w: number, h: number) => `Gr\u00f6\u00dfe: ${w} mal ${h} Pixel.`,
	resizeHint: (shrink: string, grow: string) =>
		`${shrink} / ${grow} zum \u00c4ndern der Gr\u00f6\u00dfe.`,
	imageResized: (w: number, h: number) => `Bild auf ${w} mal ${h} Pixel ge\u00e4ndert.`,
	keyboardResizeHint: (shrink: string, grow: string) =>
		`${shrink} / ${grow} zum \u00c4ndern der Gr\u00f6\u00dfe`,
};

export default locale;
