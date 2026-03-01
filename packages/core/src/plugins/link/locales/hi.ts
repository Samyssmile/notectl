import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	label: 'लिंक',
	tooltip: (shortcut: string) => `लिंक डालें (${shortcut})`,
	removeLink: 'लिंक हटाएँ',
	removeLinkAria: 'लिंक हटाएँ',
	urlPlaceholder: 'https://...',
	urlAria: 'लिंक URL',
	apply: 'लागू करें',
	applyAria: 'लिंक लागू करें',
};

export default locale;
