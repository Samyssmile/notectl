import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	openLink: 'Abrir link',
	openLinkInNewTab: 'Abrir link em uma nova aba',
	closePreview: 'Fechar prévia do link',
	previewOpened: 'Prévia do link aberta. Pressione Tab para abrir o link ou Esc para fechar.',
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
