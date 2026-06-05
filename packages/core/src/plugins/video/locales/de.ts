import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: 'Video einfügen',
	insertVideoTooltip: 'Video einfügen',

	urlLabel: 'Video-URL',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'Video-URL',
	titleLabel: 'Titel',
	titlePlaceholder: 'Beschreiben Sie das Video',
	titleAria: 'Videotitel',
	titleHint: 'Beschreibt das Video für Screenreader. Erforderlich.',
	captionLabel: 'Beschriftung',
	captionPlaceholder: 'Optionale sichtbare Beschriftung',
	captionAria: 'Videobeschriftung',
	aspectRatioLabel: 'Seitenverhältnis',
	aspectRatioAria: 'Seitenverhältnis des Videos',

	insertButton: 'Einfügen',
	insertAria: 'Video einfügen',
	updateButton: 'Aktualisieren',
	updateAria: 'Video aktualisieren',
	cancelButton: 'Abbrechen',
	insertDialogLabel: 'Video einfügen',
	editDialogLabel: 'Video bearbeiten',

	invalidUrl: 'Geben Sie eine Video-URL von YouTube, Vimeo oder Dailymotion ein.',
	titleRequired: 'Geben Sie einen Titel ein, damit Screenreader das Video beschreiben können.',

	play: (title: string) => (title ? `Video abspielen: ${title}` : 'Video abspielen'),
	loading: 'Video wird geladen...',
	providerBadge: (provider: string) => `${provider}-Video`,
	closePlayer: 'Videoplayer schließen',

	videoAria: (provider: string, title: string) =>
		title ? `${provider}-Video: ${title}` : `${provider}-Video`,

	videoSelected: 'Video ausgewählt.',
	videoSelectedWithTitle: (title: string) => `Video ausgewählt: ${title}.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} zum Ändern der Größe.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} zum Ändern der Größe`,
	videoResized: (percent: number) => `Videogröße auf ${percent} Prozent Breite geändert.`,
	resetToDefaultSize: 'Video auf volle Breite zurückgesetzt.',

	enteredPlayer: (title: string) =>
		title
			? `${title} wird abgespielt. Drücken Sie Escape, um zum Dokument zurückzukehren.`
			: 'Video wird abgespielt. Drücken Sie Escape, um zum Dokument zurückzukehren.',
	exitedPlayer: 'Zurück zum Dokument.',

	videoOptions: 'Videooptionen',
	editVideo: 'Video bearbeiten',
	alignStart: 'Linksbündig',
	alignCenter: 'Zentriert',
	alignEnd: 'Rechtsbündig',
	deleteVideo: 'Video löschen',

	embedPrompt: 'Dieses Video einbetten?',
	embedConfirm: 'Einbetten',
	embedDismiss: 'Als Link behalten',
	embedOfferAnnounce: (provider: string) =>
		`${provider}-Link eingefügt. Wählen Sie „Einbetten“, um daraus ein Video zu machen, oder bearbeiten Sie weiter, um den Link zu behalten.`,
	embeddedAnnounce: 'Video eingebettet.',
};

export default locale;
