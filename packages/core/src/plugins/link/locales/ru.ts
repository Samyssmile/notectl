import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
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
