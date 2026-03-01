import type { PrintLocale } from '../PrintLocale.js';

const locale: PrintLocale = {
	label: 'Drucken',
	tooltip: (shortcut: string) => `Drucken (${shortcut})`,
	printingAnnouncement: 'Druckvorgang',
};

export default locale;
