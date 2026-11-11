import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	editLink: 'Link bewerken',
	closeBubble: 'Linkvenster sluiten',
	bubbleOpened: 'Linkvenster geopend. Druk op Tab voor linkacties of Escape om te sluiten.',
	openLink: 'Link openen',
	openLinkInNewTab: 'Link openen in nieuw tabblad',
	closePreview: 'Linkvoorbeeld sluiten',
	previewOpened: 'Linkvoorbeeld geopend. Druk op Tab om de link te openen of Escape om te sluiten.',
	label: 'Link',
	tooltip: (shortcut: string) => `Link invoegen (${shortcut})`,
	removeLink: 'Link verwijderen',
	removeLinkAria: 'Link verwijderen',
	urlPlaceholder: 'https://...',
	urlAria: 'Link-URL',
	apply: 'Toepassen',
	applyAria: 'Link toepassen',
	invalidUrl: 'Alleen http(s), mailto, tel, ankers en relatieve paden zijn toegestaan.',
};

export default locale;
