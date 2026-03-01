import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Codeblock',
	tooltip: (shortcut?: string) => (shortcut ? `Codeblock (${shortcut})` : 'Codeblock'),
	enteredCodeBlock: 'Codeblock betreten. Escape zum Verlassen dr\u00fccken.',
	leftCodeBlock: 'Codeblock verlassen.',
};

export default locale;
