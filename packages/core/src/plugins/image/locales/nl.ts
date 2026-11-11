import type { ImageLocale } from '../ImageLocale.js';

const locale: ImageLocale = {
	insertImage: 'Afbeelding invoegen',
	insertImageTooltip: 'Afbeelding invoegen',
	uploadFromComputer: 'Uploaden vanaf computer',
	uploadAria: 'Afbeelding uploaden vanaf computer',
	separator: 'of',
	urlPlaceholder: 'https://...',
	urlAria: 'Afbeelding-URL',
	insertButton: 'Invoegen',
	insertAria: 'Afbeelding invoegen',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Afbeelding'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} bij ${height} pixels`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Afbeelding teruggezet naar oorspronkelijke grootte.',
	uploadFailed: 'Uploaden mislukt.',
	uploading: 'Uploaden...',
	resizeHandleLabel: (position: string) => {
		const positions: Record<string, string> = {
			'top-left': 'linksboven',
			'top-right': 'rechtsboven',
			'bottom-left': 'linksonder',
			'bottom-right': 'rechtsonder',
		};
		return `Grootte wijzigen ${positions[position] ?? position}`;
	},
	imageSelected: 'Afbeelding geselecteerd.',
	altTextPrefix: 'Alt-tekst: ',
	imageSizeAnnounce: (w: number, h: number) => `Grootte: ${w} bij ${h} pixels.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} om de grootte te wijzigen.`,
	imageResized: (w: number, h: number) => `Afbeelding gewijzigd naar ${w} bij ${h} pixels.`,
	keyboardResizeHint: (shrink: string, grow: string) =>
		`${shrink} / ${grow} om de grootte te wijzigen`,
};

export default locale;
