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

	sizeLabel: '\u5c3a\u5bf8\u2026',
	sizeDialogLabel: '\u8868\u683c\u5c3a\u5bf8',
	columnWidthLabel: '\u5217\u5bbd\uff08px\uff09',
	rowMinimumHeightLabel: '\u884c\u6700\u5c0f\u9ad8\u5ea6\uff08px\uff09',
	automatic: '\u81ea\u52a8',
	mixed: '\u6df7\u5408\u503c',
	apply: '\u5e94\u7528',
	cancel: '\u53d6\u6d88',
	resetColumnWidth: '\u91cd\u7f6e\u5217\u5bbd',
	resetRowMinimumHeight: '\u91cd\u7f6e\u884c\u6700\u5c0f\u9ad8\u5ea6',
	resetAllSizes: '\u91cd\u7f6e\u6240\u6709\u5c3a\u5bf8',
	invalidDimensionRange: (minimum: number, maximum: number) =>
		`\u8bf7\u8f93\u5165 ${minimum} \u5230 ${maximum} px \u4e4b\u95f4\u7684\u503c\u3002`,
	selectRowLabel: (rowIndex: number) => `\u9009\u62e9\u7b2c ${rowIndex + 1} \u884c`,
	selectColumnLabel: (columnIndex: number) => `\u9009\u62e9\u7b2c ${columnIndex + 1} \u5217`,
	resizeColumnSeparatorLabel: (columnIndex: number) =>
		`\u8c03\u6574\u7b2c ${columnIndex + 1} \u5217\u7684\u5bbd\u5ea6`,
	resizeRowSeparatorLabel: (rowIndex: number) =>
		`\u8c03\u6574\u7b2c ${rowIndex + 1} \u884c\u7684\u9ad8\u5ea6`,
	resizeKeyboardHint: (step: number, largeStep: number) =>
		`\u4f7f\u7528\u7bad\u5934\u952e\u6bcf\u6b21\u8c03\u6574 ${step} px\uff1b\u6309\u4f4f Shift \u6bcf\u6b21\u8c03\u6574 ${largeStep} px\u3002`,
	announceColumnWidthSet: (columnIndex: number, valuePx: number) =>
		`\u7b2c ${columnIndex + 1} \u5217\u7684\u5bbd\u5ea6\u5df2\u8bbe\u7f6e\u4e3a ${valuePx} px\u3002`,
	announceRowMinimumHeightSet: (rowIndex: number, valuePx: number) =>
		`\u7b2c ${rowIndex + 1} \u884c\u7684\u6700\u5c0f\u9ad8\u5ea6\u5df2\u8bbe\u7f6e\u4e3a ${valuePx} px\u3002`,
	announceColumnWidthReset: (columnIndex: number) =>
		`\u7b2c ${columnIndex + 1} \u5217\u7684\u5bbd\u5ea6\u5df2\u91cd\u7f6e\u4e3a\u81ea\u52a8\u3002`,
	announceRowMinimumHeightReset: (rowIndex: number) =>
		`\u7b2c ${rowIndex + 1} \u884c\u7684\u6700\u5c0f\u9ad8\u5ea6\u5df2\u91cd\u7f6e\u4e3a\u81ea\u52a8\u3002`,
	announceTableSizesReset:
		'\u6240\u6709\u5217\u5bbd\u548c\u884c\u6700\u5c0f\u9ad8\u5ea6\u5df2\u91cd\u7f6e\u4e3a\u81ea\u52a8\u3002',

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
