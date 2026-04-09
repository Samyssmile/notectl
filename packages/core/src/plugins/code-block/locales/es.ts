import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Bloque de c\u00f3digo',
	tooltip: (shortcut?: string) =>
		shortcut ? `Bloque de c\u00f3digo (${shortcut})` : 'Bloque de c\u00f3digo',
	enteredCodeBlock: 'Bloque de c\u00f3digo activado. Pulse Escape para salir.',
	leftCodeBlock: 'Bloque de c\u00f3digo desactivado.',
	copyCodeAria: 'Copiar c\u00f3digo',
	escToExit: 'Esc para salir',
	codeBlockAriaLabel: (lang: string) => `Bloque de c\u00f3digo ${lang}. Pulse Escape para salir.`,
	copiedToClipboard: 'Copiado al portapapeles',
	copyFailed: 'No se pudo copiar el c\u00f3digo',
	deleteCodeBlockAria: 'Eliminar bloque de código',
	deletedCodeBlock: 'Bloque de código eliminado',
	selectLanguageAria: 'Seleccionar idioma',
	languageChanged: (lang: string) => `Idioma cambiado a ${lang}`,
	plainText: 'texto plano',
};

export default locale;
