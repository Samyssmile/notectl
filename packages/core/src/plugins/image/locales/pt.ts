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
	uploading: 'Enviando...',
	resizeHandleLabel: (position: string) => {
		const positions: Record<string, string> = {
			'top-left': 'superior esquerdo',
			'top-right': 'superior direito',
			'bottom-left': 'inferior esquerdo',
			'bottom-right': 'inferior direito',
		};
		return `Redimensionar ${positions[position] ?? position}`;
	},
	imageSelected: 'Imagem selecionada.',
	altTextPrefix: 'Texto alternativo: ',
	imageSizeAnnounce: (w: number, h: number) => `Tamanho: ${w} por ${h} pixels.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} para redimensionar.`,
	imageResized: (w: number, h: number) => `Imagem redimensionada para ${w} por ${h} pixels.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} para redimensionar`,
};

export default locale;
