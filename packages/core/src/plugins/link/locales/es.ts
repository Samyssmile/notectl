import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	label: 'Enlace',
	tooltip: (shortcut: string) => `Insertar enlace (${shortcut})`,
	removeLink: 'Eliminar enlace',
	removeLinkAria: 'Eliminar enlace',
	urlPlaceholder: 'https://...',
	urlAria: 'URL del enlace',
	apply: 'Aplicar',
	applyAria: 'Aplicar enlace',
};

export default locale;
