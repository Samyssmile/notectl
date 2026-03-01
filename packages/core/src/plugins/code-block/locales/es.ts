import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Bloque de c\u00f3digo',
	tooltip: (shortcut?: string) =>
		shortcut ? `Bloque de c\u00f3digo (${shortcut})` : 'Bloque de c\u00f3digo',
	enteredCodeBlock: 'Bloque de c\u00f3digo activado. Pulse Escape para salir.',
	leftCodeBlock: 'Bloque de c\u00f3digo desactivado.',
};

export default locale;
