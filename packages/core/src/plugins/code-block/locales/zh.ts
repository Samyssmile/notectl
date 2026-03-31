import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: '\u4ee3\u7801\u5757',
	tooltip: (shortcut?: string) =>
		shortcut ? `\u4ee3\u7801\u5757 (${shortcut})` : '\u4ee3\u7801\u5757',
	enteredCodeBlock: '\u5df2\u8fdb\u5165\u4ee3\u7801\u5757\u3002\u6309 Escape \u9000\u51fa\u3002',
	leftCodeBlock: '\u5df2\u79bb\u5f00\u4ee3\u7801\u5757\u3002',
	copyCodeAria: '\u590d\u5236\u4ee3\u7801',
	escToExit: 'Esc \u9000\u51fa',
	codeBlockAriaLabel: (lang: string) =>
		`${lang} \u4ee3\u7801\u5757\u3002\u6309 Escape \u9000\u51fa\u3002`,
	copiedToClipboard: '\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f',
	deleteCodeBlockAria: '\u5220\u9664\u4ee3\u7801\u5757',
	deletedCodeBlock: '\u4ee3\u7801\u5757\u5df2\u5220\u9664',
	selectLanguageAria: '\u9009\u62e9\u8bed\u8a00',
	languageChanged: (lang: string) => `\u8bed\u8a00\u5df2\u66f4\u6539\u4e3a ${lang}`,
	plainText: '\u7eaf\u6587\u672c',
};

export default locale;
