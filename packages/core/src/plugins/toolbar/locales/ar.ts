import type { ToolbarLocale } from '../ToolbarLocale.js';

const locale: ToolbarLocale = {
	formattingOptionsAria:
		'\u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u062a\u0646\u0633\u064a\u0642',
	moreToolsAria: '\u0623\u062f\u0648\u0627\u062a \u0625\u0636\u0627\u0641\u064a\u0629',
	gridPickerLabel: (rows: number, cols: number) => `${rows} \u00d7 ${cols}`,
};

export default locale;
