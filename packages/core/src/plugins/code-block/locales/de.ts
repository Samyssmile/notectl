import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Codeblock',
	tooltip: (shortcut?: string) => (shortcut ? `Codeblock (${shortcut})` : 'Codeblock'),
	enteredCodeBlock: 'Codeblock betreten. Escape zum Verlassen dr\u00fccken.',
	leftCodeBlock: 'Codeblock verlassen.',
	copyCodeAria: 'Code kopieren',
	escToExit: 'Esc zum Verlassen',
	codeBlockAriaLabel: (lang: string) => `${lang}-Codeblock. Escape zum Verlassen dr\u00fccken.`,
	copiedToClipboard: 'In die Zwischenablage kopiert',
	copyFailed: 'Code konnte nicht kopiert werden',
	deleteCodeBlockAria: 'Codeblock löschen',
	deletedCodeBlock: 'Codeblock gelöscht',
	selectLanguageAria: 'Sprache auswählen',
	languageChanged: (lang: string) => `Sprache auf ${lang} geändert`,
	plainText: 'Klartext',
};

export default locale;
