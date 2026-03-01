import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	label: 'Lien',
	tooltip: (shortcut: string) => `Insérer un lien (${shortcut})`,
	removeLink: 'Supprimer le lien',
	removeLinkAria: 'Supprimer le lien',
	urlPlaceholder: 'https://...',
	urlAria: 'URL du lien',
	apply: 'Appliquer',
	applyAria: 'Appliquer le lien',
};

export default locale;
