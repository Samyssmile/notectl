/** Locale interface and default English locale for the VideoPlugin. */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface VideoLocale {
	// Toolbar
	readonly insertVideo: string;
	readonly insertVideoTooltip: string;

	// Insert / edit popup — fields
	readonly urlLabel: string;
	readonly urlPlaceholder: string;
	readonly urlAria: string;
	readonly titleLabel: string;
	readonly titlePlaceholder: string;
	readonly titleAria: string;
	readonly titleHint: string;
	readonly captionLabel: string;
	readonly captionPlaceholder: string;
	readonly captionAria: string;
	readonly aspectRatioLabel: string;
	readonly aspectRatioAria: string;

	// Popup — actions and dialog labels
	readonly insertButton: string;
	readonly insertAria: string;
	readonly updateButton: string;
	readonly updateAria: string;
	readonly cancelButton: string;
	readonly insertDialogLabel: string;
	readonly editDialogLabel: string;

	// Popup — validation
	readonly invalidUrl: string;
	readonly titleRequired: string;

	// Facade (click-to-load)
	readonly play: (title: string) => string;
	readonly loading: string;
	readonly providerBadge: (provider: string) => string;
	readonly closePlayer: string;

	// Figure / NodeView accessible name
	readonly videoAria: (provider: string, title: string) => string;

	// Selection + resize announcements
	readonly videoSelected: string;
	readonly videoSelectedWithTitle: (title: string) => string;
	readonly resizeHint: (shrink: string, grow: string) => string;
	readonly keyboardResizeHint: (shrink: string, grow: string) => string;
	readonly videoResized: (percent: number) => string;
	readonly resetToDefaultSize: string;

	// Player enter / exit
	readonly enteredPlayer: (title: string) => string;
	readonly exitedPlayer: string;

	// On-selection edit toolbar
	readonly videoOptions: string;
	readonly editVideo: string;
	readonly alignStart: string;
	readonly alignCenter: string;
	readonly alignEnd: string;
	readonly deleteVideo: string;

	// Ask-first paste affordance
	readonly embedPrompt: string;
	readonly embedConfirm: string;
	readonly embedDismiss: string;
	readonly embedOfferAnnounce: (provider: string) => string;
	readonly embeddedAnnounce: string;
}

// --- Default English Locale ---

export const VIDEO_LOCALE_EN: VideoLocale = {
	insertVideo: 'Insert Video',
	insertVideoTooltip: 'Insert Video',

	urlLabel: 'Video URL',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'Video URL',
	titleLabel: 'Title',
	titlePlaceholder: 'Describe the video',
	titleAria: 'Video title',
	titleHint: 'Describes the video for screen readers. Required.',
	captionLabel: 'Caption',
	captionPlaceholder: 'Optional visible caption',
	captionAria: 'Video caption',
	aspectRatioLabel: 'Aspect ratio',
	aspectRatioAria: 'Video aspect ratio',

	insertButton: 'Insert',
	insertAria: 'Insert video',
	updateButton: 'Update',
	updateAria: 'Update video',
	cancelButton: 'Cancel',
	insertDialogLabel: 'Insert video',
	editDialogLabel: 'Edit video',

	invalidUrl: 'Enter a YouTube, Vimeo, or Dailymotion video URL.',
	titleRequired: 'Enter a title so screen readers can describe the video.',

	play: (title: string) => (title ? `Play video: ${title}` : 'Play video'),
	loading: 'Loading video...',
	providerBadge: (provider: string) => `${provider} video`,
	closePlayer: 'Close video player',

	videoAria: (provider: string, title: string) =>
		title ? `${provider} video: ${title}` : `${provider} video`,

	videoSelected: 'Video selected.',
	videoSelectedWithTitle: (title: string) => `Video selected: ${title}.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} to resize.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} to resize`,
	videoResized: (percent: number) => `Video resized to ${percent} percent width.`,
	resetToDefaultSize: 'Video reset to full width.',

	enteredPlayer: (title: string) =>
		title
			? `Playing ${title}. Press Escape to return to the document.`
			: 'Playing video. Press Escape to return to the document.',
	exitedPlayer: 'Returned to the document.',

	videoOptions: 'Video options',
	editVideo: 'Edit video',
	alignStart: 'Align left',
	alignCenter: 'Align center',
	alignEnd: 'Align right',
	deleteVideo: 'Delete video',

	embedPrompt: 'Embed this video?',
	embedConfirm: 'Embed',
	embedDismiss: 'Keep as link',
	embedOfferAnnounce: (provider: string) =>
		`${provider} link pasted. Press Embed to turn it into a video, or continue editing to keep it as a link.`,
	embeddedAnnounce: 'Video embedded.',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<VideoLocale> = import.meta.glob<{
	default: VideoLocale;
}>('./locales/*.ts', { eager: false });

export async function loadVideoLocale(lang: string): Promise<VideoLocale> {
	return loadLocaleModule(localeModules, lang, VIDEO_LOCALE_EN);
}
