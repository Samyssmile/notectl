import type { TableLocale } from '../TableLocale.js';

const locale: TableLocale = {
	insertRowAbove: '\u5728\u4e0a\u65b9\u63d2\u5165\u884c',
	insertRowBelow: '\u5728\u4e0b\u65b9\u63d2\u5165\u884c',
	insertColumnLeft: '\u5728\u5de6\u4fa7\u63d2\u5165\u5217',
	insertColumnRight: '\u5728\u53f3\u4fa7\u63d2\u5165\u5217',
	deleteRow: '\u5220\u9664\u884c',
	deleteColumn: '\u5220\u9664\u5217',
	borderColorLabel: '\u8fb9\u6846\u989c\u8272\u2026',
	deleteTable: '\u5220\u9664\u8868\u683c',

	tableActions: '\u8868\u683c\u64cd\u4f5c',
	menuKeyboardHint: '\u2191\u2193 \u5bfc\u822a \u00b7 Enter \u9009\u62e9 \u00b7 Esc \u5173\u95ed',

	insertRow: '\u63d2\u5165\u884c',
	insertColumn: '\u63d2\u5165\u5217',
	addRow: '\u6dfb\u52a0\u884c',
	addColumn: '\u6dfb\u52a0\u5217',
	tableActionsHint: '\u8868\u683c\u64cd\u4f5c\uff08\u53f3\u952e\u6216 Shift+F10\uff09',
	contextMenuHint: '\u53f3\u952e\u6216 Shift+F10 \u6253\u5f00\u8868\u683c\u64cd\u4f5c',
	borderColor: '\u8fb9\u6846\u989c\u8272',

	defaultColor: '\u9ed8\u8ba4',
	noBorders: '\u65e0\u8fb9\u6846',
	borderColorPicker: '\u8fb9\u6846\u989c\u8272\u9009\u62e9\u5668',
	announceBorderColorSet: (colorName: string) =>
		`\u8868\u683c\u8fb9\u6846\u989c\u8272\u5df2\u8bbe\u7f6e\u4e3a${colorName}`,
	announceBorderReset: '\u8868\u683c\u8fb9\u6846\u5df2\u91cd\u7f6e\u4e3a\u9ed8\u8ba4',
	borderSwatchLabel: (colorName: string) => `\u8fb9\u6846 ${colorName}`,

	announceRowInsertedAbove: '\u5df2\u5728\u4e0a\u65b9\u63d2\u5165\u884c',
	announceRowInsertedBelow: '\u5df2\u5728\u4e0b\u65b9\u63d2\u5165\u884c',
	announceColumnInserted: (side: string) => `\u5df2\u63d2\u5165\u5217\u5230${side}`,
	announceRowDeleted: '\u884c\u5df2\u5220\u9664',
	announceColumnDeleted: '\u5217\u5df2\u5220\u9664',
	announceTableDeleted: '\u8868\u683c\u5df2\u5220\u9664',

	insertTable: '\u63d2\u5165\u8868\u683c',

	tableAriaLabel: (rows: number, cols: number) => `\u8868\u683c\uff0c${rows} \u884c ${cols} \u5217`,
	tableAriaDescription: '\u53f3\u952e\u6216 Shift+F10 \u6253\u5f00\u8868\u683c\u64cd\u4f5c',
};

export default locale;
