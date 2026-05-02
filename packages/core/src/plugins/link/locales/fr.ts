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
	invalidUrl: 'Seuls http(s), mailto, tel, ancres et chemins relatifs sont autorisés.',
};

export default locale;
