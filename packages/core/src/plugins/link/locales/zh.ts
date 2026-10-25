import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	openLink: '打开链接',
	openLinkInNewTab: '在新标签页中打开链接',
	closePreview: '关闭链接预览',
	label: '链接',
	tooltip: (shortcut: string) => `插入链接 (${shortcut})`,
	removeLink: '移除链接',
	removeLinkAria: '移除链接',
	urlPlaceholder: 'https://...',
	urlAria: '链接地址',
	apply: '应用',
	applyAria: '应用链接',
	invalidUrl: '仅允许 http(s)、mailto、tel、锚点和相对路径。',
};

export default locale;
