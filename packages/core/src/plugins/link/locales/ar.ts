import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	label: 'رابط',
	tooltip: (shortcut: string) => `إدراج رابط (${shortcut})`,
	removeLink: 'إزالة الرابط',
	removeLinkAria: 'إزالة الرابط',
	urlPlaceholder: 'https://...',
	urlAria: 'عنوان الرابط',
	apply: 'تطبيق',
	applyAria: 'تطبيق الرابط',
};

export default locale;
