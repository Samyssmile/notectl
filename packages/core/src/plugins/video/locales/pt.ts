import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: 'Inserir vídeo',
	insertVideoTooltip: 'Inserir vídeo',

	urlLabel: 'URL do vídeo',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'URL do vídeo',
	titleLabel: 'Título',
	titlePlaceholder: 'Descreva o vídeo',
	titleAria: 'Título do vídeo',
	titleHint: 'Descreve o vídeo para leitores de tela. Obrigatório.',
	captionLabel: 'Legenda',
	captionPlaceholder: 'Legenda visível opcional',
	captionAria: 'Legenda do vídeo',
	aspectRatioLabel: 'Proporção',
	aspectRatioAria: 'Proporção do vídeo',

	insertButton: 'Inserir',
	insertAria: 'Inserir vídeo',
	updateButton: 'Atualizar',
	updateAria: 'Atualizar vídeo',
	cancelButton: 'Cancelar',
	insertDialogLabel: 'Inserir vídeo',
	editDialogLabel: 'Editar vídeo',

	invalidUrl: 'Insira uma URL de vídeo do YouTube, Vimeo ou Dailymotion.',
	titleRequired: 'Insira um título para que os leitores de tela descrevam o vídeo.',

	play: (title: string) => (title ? `Reproduzir vídeo: ${title}` : 'Reproduzir vídeo'),
	loading: 'Carregando vídeo...',
	providerBadge: (provider: string) => `Vídeo do ${provider}`,
	closePlayer: 'Fechar o player de vídeo',

	videoAria: (provider: string, title: string) =>
		title ? `Vídeo do ${provider}: ${title}` : `Vídeo do ${provider}`,

	videoSelected: 'Vídeo selecionado.',
	videoSelectedWithTitle: (title: string) => `Vídeo selecionado: ${title}.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} para redimensionar.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} para redimensionar`,
	videoResized: (percent: number) => `Vídeo redimensionado para ${percent} por cento de largura.`,
	resetToDefaultSize: 'Vídeo redefinido para largura total.',

	enteredPlayer: (title: string) =>
		title
			? `Reproduzindo ${title}. Pressione Escape para voltar ao documento.`
			: 'Reproduzindo vídeo. Pressione Escape para voltar ao documento.',
	exitedPlayer: 'De volta ao documento.',

	videoOptions: 'Opções de vídeo',
	editVideo: 'Editar vídeo',
	alignStart: 'Alinhar à esquerda',
	alignCenter: 'Centralizar',
	alignEnd: 'Alinhar à direita',
	deleteVideo: 'Excluir vídeo',

	embedPrompt: 'Incorporar este vídeo?',
	embedConfirm: 'Incorporar',
	embedDismiss: 'Manter como link',
	embedOfferAnnounce: (provider: string) =>
		`Link do ${provider} colado. Escolha Incorporar para transformá-lo em vídeo, ou continue editando para mantê-lo como link.`,
	embeddedAnnounce: 'Vídeo incorporado.',
};

export default locale;
