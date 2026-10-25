import type { LinkLocale } from '../LinkLocale.js';

const locale: LinkLocale = {
	openLink: 'Abrir enlace',
	openLinkInNewTab: 'Abrir enlace en una pestaña nueva',
	closePreview: 'Cerrar vista previa del enlace',
	previewOpened:
		'Vista previa del enlace abierta. Pulsa Tab para abrir el enlace o Escape para cerrarla.',
	label: 'Enlace',
	tooltip: (shortcut: string) => `Insertar enlace (${shortcut})`,
	removeLink: 'Eliminar enlace',
	removeLinkAria: 'Eliminar enlace',
	urlPlaceholder: 'https://...',
	urlAria: 'URL del enlace',
	apply: 'Aplicar',
	applyAria: 'Aplicar enlace',
	invalidUrl: 'Solo se permiten http(s), mailto, tel, anclas y rutas relativas.',
};

export default locale;
