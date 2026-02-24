/**
 * Supported locale identifiers for the notectl editor.
 * Use `Locale.BROWSER` to auto-detect from navigator.language.
 */
export const Locale = {
	EN: 'en',
	DE: 'de',
	ES: 'es',
	FR: 'fr',
	ZH: 'zh',
	RU: 'ru',
	AR: 'ar',
	HI: 'hi',
	BROWSER: 'browser',
} as const;

export type Locale = (typeof Locale)[keyof typeof Locale];
