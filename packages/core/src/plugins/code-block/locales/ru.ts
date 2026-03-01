import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: '\u0411\u043b\u043e\u043a \u043a\u043e\u0434\u0430',
	tooltip: (shortcut?: string) =>
		shortcut
			? `\u0411\u043b\u043e\u043a \u043a\u043e\u0434\u0430 (${shortcut})`
			: '\u0411\u043b\u043e\u043a \u043a\u043e\u0434\u0430',
	enteredCodeBlock:
		'\u0412\u0445\u043e\u0434 \u0432 \u0431\u043b\u043e\u043a \u043a\u043e\u0434\u0430. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 Escape \u0434\u043b\u044f \u0432\u044b\u0445\u043e\u0434\u0430.',
	leftCodeBlock:
		'\u0412\u044b\u0445\u043e\u0434 \u0438\u0437 \u0431\u043b\u043e\u043a\u0430 \u043a\u043e\u0434\u0430.',
};

export default locale;
