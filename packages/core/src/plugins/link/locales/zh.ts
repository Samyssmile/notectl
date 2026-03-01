import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	label: '链接',
	tooltip: (shortcut: string) => `插入链接 (${shortcut})`,
	removeLink: '移除链接',
	removeLinkAria: '移除链接',
	urlPlaceholder: 'https://...',
	urlAria: '链接地址',
	apply: '应用',
	applyAria: '应用链接',
};

export default locale;
