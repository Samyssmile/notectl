import type { ImageLocale } from '../ImageLocale.js';

const locale: ImageLocale = {
	insertImage: 'Insertar imagen',
	insertImageTooltip: 'Insertar imagen',
	uploadFromComputer: 'Subir desde el ordenador',
	uploadAria: 'Subir imagen desde el ordenador',
	separator: 'o',
	urlPlaceholder: 'https://...',
	urlAria: 'URL de la imagen',
	insertButton: 'Insertar',
	insertAria: 'Insertar imagen',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Imagen'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} por ${height} p\u00edxeles`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Imagen restablecida a tama\u00f1o natural.',
	uploadFailed: 'Error al subir la imagen.',
	uploading: 'Subiendo...',
	resizeHandleLabel: (position: string) => {
		const positions: Record<string, string> = {
			'top-left': 'superior izquierda',
			'top-right': 'superior derecha',
			'bottom-left': 'inferior izquierda',
			'bottom-right': 'inferior derecha',
		};
		return `Redimensionar ${positions[position] ?? position}`;
	},
	imageSelected: 'Imagen seleccionada.',
	altTextPrefix: 'Texto alternativo: ',
	imageSizeAnnounce: (w: number, h: number) => `Tama\u00f1o: ${w} por ${h} p\u00edxeles.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} para redimensionar.`,
	imageResized: (w: number, h: number) => `Imagen redimensionada a ${w} por ${h} p\u00edxeles.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} para redimensionar`,
};

export default locale;
