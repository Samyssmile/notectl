import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Codeblok',
	tooltip: (shortcut?: string) => (shortcut ? `Codeblok (${shortcut})` : 'Codeblok'),
	enteredCodeBlock: 'Codeblok geopend. Druk op Escape om te verlaten.',
	leftCodeBlock: 'Codeblok verlaten.',
	copyCodeAria: 'Code kopiëren',
	escToExit: 'Esc om te verlaten',
	codeBlockAriaLabel: (lang: string) => `Codeblock (${lang}). Druk op Escape om te verlaten.`,
	copiedToClipboard: 'Gekopieerd naar klembord',
	copyFailed: 'Code kopiëren mislukt',
	deleteCodeBlockAria: 'Codeblok verwijderen',
	deletedCodeBlock: 'Codeblok verwijderd',
	selectLanguageAria: 'Taal selecteren',
	languageChanged: (lang: string) => `Taal gewijzigd naar ${lang}`,
	plainText: 'platte tekst',
	indentedNLines: (n: number) => (n === 1 ? 'Inspringing van 1 regel vergroot' : `Inspringing van ${n} regels vergroot`),
	dedentedNLines: (n: number) => (n === 1 ? 'Inspringing van 1 regel verkleind' : `Inspringing van ${n} regels verkleind`),
};

export default locale;
