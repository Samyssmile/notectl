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
	invalidUrl: 'केवल http(s), mailto, tel, फ़्रैगमेंट और सापेक्ष पथ की अनुमति है।',
};

export default locale;
