import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Bloc de code',
	tooltip: (shortcut?: string) => (shortcut ? `Bloc de code (${shortcut})` : 'Bloc de code'),
	enteredCodeBlock: 'Bloc de code activ\u00e9. Appuyez sur \u00c9chap pour quitter.',
	leftCodeBlock: 'Bloc de code quitt\u00e9.',
};

export default locale;
