import type { VideoLocale } from '../VideoLocale.js';

const locale: VideoLocale = {
	insertVideo: 'Вставить видео',
	insertVideoTooltip: 'Вставить видео',

	urlLabel: 'URL видео',
	urlPlaceholder: 'https://www.youtube.com/watch?v=...',
	urlAria: 'URL видео',
	titleLabel: 'Заголовок',
	titlePlaceholder: 'Опишите видео',
	titleAria: 'Заголовок видео',
	titleHint: 'Описывает видео для программ чтения с экрана. Обязательно.',
	captionLabel: 'Подпись',
	captionPlaceholder: 'Необязательная видимая подпись',
	captionAria: 'Подпись видео',
	aspectRatioLabel: 'Соотношение сторон',
	aspectRatioAria: 'Соотношение сторон видео',

	insertButton: 'Вставить',
	insertAria: 'Вставить видео',
	updateButton: 'Обновить',
	updateAria: 'Обновить видео',
	cancelButton: 'Отмена',
	insertDialogLabel: 'Вставить видео',
	editDialogLabel: 'Редактировать видео',

	invalidUrl: 'Введите URL видео с YouTube, Vimeo или Dailymotion.',
	titleRequired: 'Введите заголовок, чтобы программы чтения с экрана описывали видео.',

	play: (title: string) => (title ? `Воспроизвести видео: ${title}` : 'Воспроизвести видео'),
	loading: 'Загрузка видео...',
	providerBadge: (provider: string) => `Видео ${provider}`,
	closePlayer: 'Закрыть видеоплеер',

	videoAria: (provider: string, title: string) =>
		title ? `Видео ${provider}: ${title}` : `Видео ${provider}`,

	videoSelected: 'Видео выбрано.',
	videoSelectedWithTitle: (title: string) => `Видео выбрано: ${title}.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} для изменения размера.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} для изменения размера`,
	videoResized: (percent: number) => `Размер видео изменён до ${percent} процентов ширины.`,
	resetToDefaultSize: 'Видео восстановлено до полной ширины.',

	enteredPlayer: (title: string) =>
		title
			? `Воспроизведение ${title}. Нажмите Escape, чтобы вернуться к документу.`
			: 'Воспроизведение видео. Нажмите Escape, чтобы вернуться к документу.',
	exitedPlayer: 'Возврат к документу.',

	videoOptions: 'Параметры видео',
	editVideo: 'Редактировать видео',
	alignStart: 'По левому краю',
	alignCenter: 'По центру',
	alignEnd: 'По правому краю',
	deleteVideo: 'Удалить видео',

	embedPrompt: 'Встроить это видео?',
	embedConfirm: 'Встроить',
	embedDismiss: 'Оставить ссылкой',
	embedOfferAnnounce: (provider: string) =>
		`Ссылка ${provider} вставлена. Нажмите «Встроить», чтобы превратить её в видео, или продолжайте редактирование, чтобы оставить ссылкой.`,
	embeddedAnnounce: 'Видео встроено.',
};

export default locale;
