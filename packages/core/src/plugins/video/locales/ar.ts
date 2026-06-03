import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: 'إدراج فيديو',
	insertVideoTooltip: 'إدراج فيديو',

	urlLabel: 'رابط الفيديو',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'رابط الفيديو',
	titleLabel: 'العنوان',
	titlePlaceholder: 'صِف الفيديو',
	titleAria: 'عنوان الفيديو',
	titleHint: 'يصف الفيديو لقارئات الشاشة. مطلوب.',
	captionLabel: 'التسمية التوضيحية',
	captionPlaceholder: 'تسمية توضيحية مرئية اختيارية',
	captionAria: 'التسمية التوضيحية للفيديو',
	aspectRatioLabel: 'نسبة العرض إلى الارتفاع',
	aspectRatioAria: 'نسبة العرض إلى الارتفاع للفيديو',

	insertButton: 'إدراج',
	insertAria: 'إدراج الفيديو',
	updateButton: 'تحديث',
	updateAria: 'تحديث الفيديو',
	cancelButton: 'إلغاء',
	insertDialogLabel: 'إدراج فيديو',
	editDialogLabel: 'تعديل الفيديو',

	invalidUrl: 'أدخل رابط فيديو من YouTube أو Vimeo أو Dailymotion.',
	titleRequired: 'أدخل عنوانًا حتى تتمكن قارئات الشاشة من وصف الفيديو.',

	play: (title: string) => (title ? `تشغيل الفيديو: ${title}` : 'تشغيل الفيديو'),
	loading: 'جارٍ تحميل الفيديو...',
	providerBadge: (provider: string) => `فيديو ${provider}`,
	closePlayer: 'إغلاق مشغّل الفيديو',

	videoAria: (provider: string, title: string) =>
		title ? `فيديو ${provider}: ${title}` : `فيديو ${provider}`,

	videoSelected: 'تم تحديد الفيديو.',
	videoSelectedWithTitle: (title: string) => `تم تحديد الفيديو: ${title}.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} لتغيير الحجم.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} لتغيير الحجم`,
	videoResized: (percent: number) => `تم تغيير حجم الفيديو إلى ${percent} بالمئة من العرض.`,
	resetToDefaultSize: 'تمت إعادة الفيديو إلى العرض الكامل.',

	enteredPlayer: (title: string) =>
		title
			? `جارٍ تشغيل ${title}. اضغط Escape للعودة إلى المستند.`
			: 'جارٍ تشغيل الفيديو. اضغط Escape للعودة إلى المستند.',
	exitedPlayer: 'تمت العودة إلى المستند.',

	videoOptions: 'خيارات الفيديو',
	editVideo: 'تعديل الفيديو',
	alignStart: 'محاذاة لليسار',
	alignCenter: 'توسيط',
	alignEnd: 'محاذاة لليمين',
	deleteVideo: 'حذف الفيديو',

	embedPrompt: 'تضمين هذا الفيديو؟',
	embedConfirm: 'تضمين',
	embedDismiss: 'الإبقاء كرابط',
	embedOfferAnnounce: (provider: string) =>
		`تم لصق رابط ${provider}. اختر "تضمين" لتحويله إلى فيديو، أو تابع التحرير للإبقاء عليه كرابط.`,
	embeddedAnnounce: 'تم تضمين الفيديو.',
};

export default locale;
