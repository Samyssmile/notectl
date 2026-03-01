import type { PrintLocale } from '../PrintLocale.js';

const locale: PrintLocale = {
	label: 'Imprimer',
	tooltip: (shortcut: string) => `Imprimer (${shortcut})`,
	printingAnnouncement: 'Impression',
};

export default locale;
