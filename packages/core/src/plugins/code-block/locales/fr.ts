import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Bloc de code',
	tooltip: (shortcut?: string) => (shortcut ? `Bloc de code (${shortcut})` : 'Bloc de code'),
	enteredCodeBlock: 'Bloc de code activ\u00e9. Appuyez sur \u00c9chap pour quitter.',
	leftCodeBlock: 'Bloc de code quitt\u00e9.',
	copyCodeAria: 'Copier le code',
	escToExit: '\u00c9chap pour quitter',
	codeBlockAriaLabel: (lang: string) =>
		`Bloc de code ${lang}. Appuyez sur \u00c9chap pour quitter.`,
	copiedToClipboard: 'Copi\u00e9 dans le presse-papiers',
	deleteCodeBlockAria: 'Supprimer le bloc de code',
	deletedCodeBlock: 'Bloc de code supprimé',
	selectLanguageAria: 'Sélectionner le langage',
	languageChanged: (lang: string) => `Langage changé en ${lang}`,
	plainText: 'texte brut',
};

export default locale;
