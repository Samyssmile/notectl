import type { SuperSubLocale } from '../SuperSubLocale.js';

const locale: SuperSubLocale = {
	superscriptLabel: 'Hochgestellt',
	superscriptTooltip: (shortcut: string) => `Hochgestellt (${shortcut})`,
	subscriptLabel: 'Tiefgestellt',
	subscriptTooltip: (shortcut: string) => `Tiefgestellt (${shortcut})`,
};

export default locale;
