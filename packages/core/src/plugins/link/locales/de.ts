import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	openLink: 'Link öffnen',
	openLinkInNewTab: 'Link in neuem Tab öffnen',
	closePreview: 'Linkvorschau schließen',
	label: 'Link',
	tooltip: (shortcut: string) => `Link einfügen (${shortcut})`,
	removeLink: 'Link entfernen',
	removeLinkAria: 'Link entfernen',
	urlPlaceholder: 'https://...',
	urlAria: 'Link-URL',
	apply: 'Anwenden',
	applyAria: 'Link anwenden',
	invalidUrl: 'Nur http(s), mailto, tel, Anker und relative Pfade sind erlaubt.',
};

export default locale;
