import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	openLink: 'فتح الرابط',
	openLinkInNewTab: 'فتح الرابط في علامة تبويب جديدة',
	closePreview: 'إغلاق معاينة الرابط',
	label: 'رابط',
	tooltip: (shortcut: string) => `إدراج رابط (${shortcut})`,
	removeLink: 'إزالة الرابط',
	removeLinkAria: 'إزالة الرابط',
	urlPlaceholder: 'https://...',
	urlAria: 'عنوان الرابط',
	apply: 'تطبيق',
	applyAria: 'تطبيق الرابط',
	invalidUrl: 'يُسمح فقط بـ http(s) و mailto و tel والمراسي والمسارات النسبية.',
};

export default locale;
