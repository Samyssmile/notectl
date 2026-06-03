import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: 'Insérer une vidéo',
	insertVideoTooltip: 'Insérer une vidéo',

	urlLabel: 'URL de la vidéo',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'URL de la vidéo',
	titleLabel: 'Titre',
	titlePlaceholder: 'Décrivez la vidéo',
	titleAria: 'Titre de la vidéo',
	titleHint: 'Décrit la vidéo pour les lecteurs d’écran. Obligatoire.',
	captionLabel: 'Légende',
	captionPlaceholder: 'Légende visible facultative',
	captionAria: 'Légende de la vidéo',
	aspectRatioLabel: 'Format d’image',
	aspectRatioAria: 'Format d’image de la vidéo',

	insertButton: 'Insérer',
	insertAria: 'Insérer la vidéo',
	updateButton: 'Mettre à jour',
	updateAria: 'Mettre à jour la vidéo',
	cancelButton: 'Annuler',
	insertDialogLabel: 'Insérer une vidéo',
	editDialogLabel: 'Modifier la vidéo',

	invalidUrl: 'Saisissez une URL de vidéo YouTube, Vimeo ou Dailymotion.',
	titleRequired: 'Saisissez un titre pour que les lecteurs d’écran décrivent la vidéo.',

	play: (title: string) => (title ? `Lire la vidéo : ${title}` : 'Lire la vidéo'),
	loading: 'Chargement de la vidéo...',
	providerBadge: (provider: string) => `Vidéo ${provider}`,
	closePlayer: 'Fermer le lecteur vidéo',

	videoAria: (provider: string, title: string) =>
		title ? `Vidéo ${provider} : ${title}` : `Vidéo ${provider}`,

	videoSelected: 'Vidéo sélectionnée.',
	videoSelectedWithTitle: (title: string) => `Vidéo sélectionnée : ${title}.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} pour redimensionner.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} pour redimensionner`,
	videoResized: (percent: number) => `Vidéo redimensionnée à ${percent} pour cent de largeur.`,
	resetToDefaultSize: 'Vidéo réinitialisée à pleine largeur.',

	enteredPlayer: (title: string) =>
		title
			? `Lecture de ${title}. Appuyez sur Échap pour revenir au document.`
			: 'Lecture de la vidéo. Appuyez sur Échap pour revenir au document.',
	exitedPlayer: 'Retour au document.',

	videoOptions: 'Options de la vidéo',
	editVideo: 'Modifier la vidéo',
	alignStart: 'Aligner à gauche',
	alignCenter: 'Centrer',
	alignEnd: 'Aligner à droite',
	deleteVideo: 'Supprimer la vidéo',

	embedPrompt: 'Intégrer cette vidéo ?',
	embedConfirm: 'Intégrer',
	embedDismiss: 'Conserver le lien',
	embedOfferAnnounce: (provider: string) =>
		`Lien ${provider} collé. Choisissez Intégrer pour le transformer en vidéo, ou continuez à éditer pour le conserver comme lien.`,
	embeddedAnnounce: 'Vidéo intégrée.',
};

export default locale;
