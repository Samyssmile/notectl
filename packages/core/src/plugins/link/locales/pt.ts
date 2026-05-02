import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	label: 'Link',
	tooltip: (shortcut: string) => `Inserir Link (${shortcut})`,
	removeLink: 'Remover Link',
	removeLinkAria: 'Remover link',
	urlPlaceholder: 'https://...',
	urlAria: 'URL do link',
	apply: 'Aplicar',
	applyAria: 'Aplicar link',
	invalidUrl: 'Apenas http(s), mailto, tel, âncoras e caminhos relativos são permitidos.',
};

export default locale;
