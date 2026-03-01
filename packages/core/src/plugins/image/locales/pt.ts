import type { ImageLocale } from '../ImageLocale.js';

const locale: ImageLocale = {
	insertImage: 'Inserir Imagem',
	insertImageTooltip: 'Inserir Imagem',
	uploadFromComputer: 'Enviar do computador',
	uploadAria: 'Enviar imagem do computador',
	separator: 'ou',
	urlPlaceholder: 'https://...',
	urlAria: 'URL da imagem',
	insertButton: 'Inserir',
	insertAria: 'Inserir imagem',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Imagem'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} por ${height} pixels`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Imagem redefinida para o tamanho natural.',
	uploadFailed: 'Falha ao enviar a imagem.',
};

export default locale;
