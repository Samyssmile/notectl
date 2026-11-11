import type { PrintLocale } from '../PrintLocale.js';

const locale: PrintLocale = {
	label: 'Afdrukken',
	tooltip: (shortcut: string) => `Afdrukken (${shortcut})`,
	printingAnnouncement: 'Bezig met afdrukken',
};

export default locale;
