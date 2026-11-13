import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: 'Video invoegen',
	insertVideoTooltip: 'Video invoegen',

	urlLabel: 'Video-URL',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'Video-URL',
	titleLabel: 'Titel',
	titlePlaceholder: 'Beschrijf de video',
	titleAria: 'Videotitel',
	titleHint: 'Beschrijft de video voor schermlezers. Verplicht.',
	captionLabel: 'Bijschrift',
	captionPlaceholder: 'Optioneel zichtbaar bijschrift',
	captionAria: 'Videobijschrift',
	aspectRatioLabel: 'Beeldverhouding',
	aspectRatioAria: 'Beeldverhouding van de video',

	insertButton: 'Invoegen',
	insertAria: 'Video invoegen',
	updateButton: 'Bijwerken',
	updateAria: 'Video bijwerken',
	cancelButton: 'Annuleren',
	insertDialogLabel: 'Video invoegen',
	editDialogLabel: 'Video bewerken',

	invalidUrl: 'Voer een video-URL van YouTube, Vimeo of Dailymotion in.',
	titleRequired: 'Voer een titel in zodat schermlezers de video kunnen beschrijven.',

	play: (title: string) => (title ? `Video afspelen: ${title}` : 'Video afspelen'),
	loading: 'Video wordt geladen...',
	providerBadge: (provider: string) => `${provider}-video`,
	closePlayer: 'Videospeler sluiten',

	videoAria: (provider: string, title: string) =>
		title ? `${provider}-video: ${title}` : `${provider}-video`,

	videoSelected: 'Video geselecteerd.',
	videoSelectedWithTitle: (title: string) => `Video geselecteerd: ${title}.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} om de grootte te wijzigen.`,
	keyboardResizeHint: (shrink: string, grow: string) =>
		`${shrink} / ${grow} om de grootte te wijzigen`,
	videoResized: (percent: number) => `Videogrootte gewijzigd naar ${percent} procent breedte.`,
	resetToDefaultSize: 'Video teruggezet naar volledige breedte.',

	enteredPlayer: (title: string) =>
		title
			? `${title} wordt afgespeeld. Druk op Escape om terug te gaan naar het document.`
			: 'Video wordt afgespeeld. Druk op Escape om terug te gaan naar het document.',
	exitedPlayer: 'Terug naar het document.',

	videoOptions: 'Video-opties',
	editVideo: 'Video bewerken',
	alignStart: 'Links uitlijnen',
	alignCenter: 'Centreren',
	alignEnd: 'Rechts uitlijnen',
	deleteVideo: 'Video verwijderen',

	embedPrompt: 'Deze video insluiten?',
	embedConfirm: 'Insluiten',
	embedDismiss: 'Als link behouden',
	embedOfferAnnounce: (provider: string) =>
		`${provider}-link geplakt. Druk op Insluiten om er een video van te maken, of ga door met bewerken om het als link te behouden.`,
	embeddedAnnounce: 'Video ingesloten.',
};

export default locale;
