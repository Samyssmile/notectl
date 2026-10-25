import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	openLink: 'Ouvrir le lien',
	openLinkInNewTab: 'Ouvrir le lien dans un nouvel onglet',
	closePreview: 'Fermer l’aperçu du lien',
	previewOpened:
		'Aperçu du lien ouvert. Appuyez sur Tab pour ouvrir le lien ou sur Échap pour le fermer.',
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
