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
};

export default locale;
