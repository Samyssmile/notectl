import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	openLink: 'Открыть ссылку',
	openLinkInNewTab: 'Открыть ссылку в новой вкладке',
	closePreview: 'Закрыть предпросмотр ссылки',
	previewOpened:
		'Предпросмотр ссылки открыт. Нажмите Tab, чтобы открыть ссылку, или Escape, чтобы закрыть.',
	label: 'Ссылка',
	tooltip: (shortcut: string) => `Вставить ссылку (${shortcut})`,
	removeLink: 'Удалить ссылку',
	removeLinkAria: 'Удалить ссылку',
	urlPlaceholder: 'https://...',
	urlAria: 'URL ссылки',
	apply: 'Применить',
	applyAria: 'Применить ссылку',
	invalidUrl: 'Разрешены только http(s), mailto, tel, якоря и относительные пути.',
};

export default locale;
