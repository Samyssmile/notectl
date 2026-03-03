import type { ToolbarLocale } from '../ToolbarLocale.js';

const locale: ToolbarLocale = {
	formattingOptionsAria:
		'\u041f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b \u0444\u043e\u0440\u043c\u0430\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f',
	moreToolsAria:
		'\u0414\u0440\u0443\u0433\u0438\u0435 \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b',
	gridPickerLabel: (rows: number, cols: number) => `${rows} x ${cols}`,
};

export default locale;
