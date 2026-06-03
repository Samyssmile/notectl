import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: 'Insertar vídeo',
	insertVideoTooltip: 'Insertar vídeo',

	urlLabel: 'URL del vídeo',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'URL del vídeo',
	titleLabel: 'Título',
	titlePlaceholder: 'Describe el vídeo',
	titleAria: 'Título del vídeo',
	titleHint: 'Describe el vídeo para los lectores de pantalla. Obligatorio.',
	captionLabel: 'Leyenda',
	captionPlaceholder: 'Leyenda visible opcional',
	captionAria: 'Leyenda del vídeo',
	aspectRatioLabel: 'Relación de aspecto',
	aspectRatioAria: 'Relación de aspecto del vídeo',

	insertButton: 'Insertar',
	insertAria: 'Insertar vídeo',
	updateButton: 'Actualizar',
	updateAria: 'Actualizar vídeo',
	cancelButton: 'Cancelar',
	insertDialogLabel: 'Insertar vídeo',
	editDialogLabel: 'Editar vídeo',

	invalidUrl: 'Introduce una URL de vídeo de YouTube, Vimeo o Dailymotion.',
	titleRequired: 'Introduce un título para que los lectores de pantalla describan el vídeo.',

	play: (title: string) => (title ? `Reproducir vídeo: ${title}` : 'Reproducir vídeo'),
	loading: 'Cargando vídeo...',
	providerBadge: (provider: string) => `Vídeo de ${provider}`,
	closePlayer: 'Cerrar el reproductor de vídeo',

	videoAria: (provider: string, title: string) =>
		title ? `Vídeo de ${provider}: ${title}` : `Vídeo de ${provider}`,

	videoSelected: 'Vídeo seleccionado.',
	videoSelectedWithTitle: (title: string) => `Vídeo seleccionado: ${title}.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} para redimensionar.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} para redimensionar`,
	videoResized: (percent: number) => `Vídeo redimensionado al ${percent} por ciento de ancho.`,
	resetToDefaultSize: 'Vídeo restablecido al ancho completo.',

	enteredPlayer: (title: string) =>
		title
			? `Reproduciendo ${title}. Pulsa Escape para volver al documento.`
			: 'Reproduciendo vídeo. Pulsa Escape para volver al documento.',
	exitedPlayer: 'Has vuelto al documento.',

	videoOptions: 'Opciones de vídeo',
	editVideo: 'Editar vídeo',
	alignStart: 'Alinear a la izquierda',
	alignCenter: 'Centrar',
	alignEnd: 'Alinear a la derecha',
	deleteVideo: 'Eliminar vídeo',

	embedPrompt: '¿Insertar este vídeo?',
	embedConfirm: 'Insertar',
	embedDismiss: 'Mantener como enlace',
	embedOfferAnnounce: (provider: string) =>
		`Enlace de ${provider} pegado. Pulsa Insertar para convertirlo en un vídeo, o sigue editando para mantenerlo como enlace.`,
	embeddedAnnounce: 'Vídeo insertado.',
};

export default locale;
