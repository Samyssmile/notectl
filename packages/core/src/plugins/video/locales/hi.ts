import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: 'वीडियो डालें',
	insertVideoTooltip: 'वीडियो डालें',

	urlLabel: 'वीडियो URL',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'वीडियो URL',
	titleLabel: 'शीर्षक',
	titlePlaceholder: 'वीडियो का वर्णन करें',
	titleAria: 'वीडियो शीर्षक',
	titleHint: 'स्क्रीन रीडर के लिए वीडियो का वर्णन करता है। आवश्यक।',
	captionLabel: 'कैप्शन',
	captionPlaceholder: 'वैकल्पिक दृश्य कैप्शन',
	captionAria: 'वीडियो कैप्शन',
	aspectRatioLabel: 'आस्पेक्ट अनुपात',
	aspectRatioAria: 'वीडियो आस्पेक्ट अनुपात',

	insertButton: 'डालें',
	insertAria: 'वीडियो डालें',
	updateButton: 'अपडेट करें',
	updateAria: 'वीडियो अपडेट करें',
	cancelButton: 'रद्द करें',
	insertDialogLabel: 'वीडियो डालें',
	editDialogLabel: 'वीडियो संपादित करें',

	invalidUrl: 'YouTube, Vimeo या Dailymotion का वीडियो URL दर्ज करें।',
	titleRequired: 'एक शीर्षक दर्ज करें ताकि स्क्रीन रीडर वीडियो का वर्णन कर सकें।',

	play: (title: string) => (title ? `वीडियो चलाएं: ${title}` : 'वीडियो चलाएं'),
	loading: 'वीडियो लोड हो रहा है...',
	providerBadge: (provider: string) => `${provider} वीडियो`,
	closePlayer: 'वीडियो प्लेयर बंद करें',

	videoAria: (provider: string, title: string) =>
		title ? `${provider} वीडियो: ${title}` : `${provider} वीडियो`,

	videoSelected: 'वीडियो चयनित।',
	videoSelectedWithTitle: (title: string) => `वीडियो चयनित: ${title}।`,
	resizeHint: (shrink: string, grow: string) => `आकार बदलने के लिए ${shrink} / ${grow}।`,
	keyboardResizeHint: (shrink: string, grow: string) => `आकार बदलने के लिए ${shrink} / ${grow}`,
	videoResized: (percent: number) => `वीडियो की चौड़ाई ${percent} प्रतिशत पर बदली गई।`,
	resetToDefaultSize: 'वीडियो पूरी चौड़ाई पर रीसेट किया गया।',

	enteredPlayer: (title: string) =>
		title
			? `${title} चल रहा है। दस्तावेज़ पर लौटने के लिए Escape दबाएं।`
			: 'वीडियो चल रहा है। दस्तावेज़ पर लौटने के लिए Escape दबाएं।',
	exitedPlayer: 'दस्तावेज़ पर लौट आए।',

	videoOptions: 'वीडियो विकल्प',
	editVideo: 'वीडियो संपादित करें',
	alignStart: 'बाएं संरेखित करें',
	alignCenter: 'केंद्र में रखें',
	alignEnd: 'दाएं संरेखित करें',
	deleteVideo: 'वीडियो हटाएं',

	embedPrompt: 'इस वीडियो को एम्बेड करें?',
	embedConfirm: 'एम्बेड करें',
	embedDismiss: 'लिंक के रूप में रखें',
	embedOfferAnnounce: (provider: string) =>
		`${provider} लिंक पेस्ट किया गया। इसे वीडियो में बदलने के लिए एम्बेड करें चुनें, या लिंक के रूप में रखने के लिए संपादन जारी रखें।`,
	embeddedAnnounce: 'वीडियो एम्बेड किया गया।',
};

export default locale;
