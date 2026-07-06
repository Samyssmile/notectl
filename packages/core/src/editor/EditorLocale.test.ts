import { describe, expect, it } from 'vitest';
import { EDITOR_LOCALE_EN, type EditorLocale, loadEditorLocale } from './EditorLocale.js';
import arLocale from './locales/ar.js';
import deLocale from './locales/de.js';
import esLocale from './locales/es.js';
import frLocale from './locales/fr.js';
import hiLocale from './locales/hi.js';
import ptLocale from './locales/pt.js';
import ruLocale from './locales/ru.js';
import zhLocale from './locales/zh.js';

const ALL_LOCALES: ReadonlyArray<readonly [string, EditorLocale]> = [
	['EN', EDITOR_LOCALE_EN],
	['DE', deLocale],
	['ES', esLocale],
	['FR', frLocale],
	['PT', ptLocale],
	['ZH', zhLocale],
	['RU', ruLocale],
	['AR', arLocale],
	['HI', hiLocale],
];

const STRING_KEYS: ReadonlyArray<keyof EditorLocale> = [
	'ariaLabel',
	'ariaDescription',
	'defaultPlaceholder',
	'markdownImported',
];

describe('EditorLocale', () => {
	describe('loadEditorLocale()', () => {
		it('returns English for "en"', async () => {
			expect(await loadEditorLocale('en')).toBe(EDITOR_LOCALE_EN);
		});

		it('falls back to English for unknown language', async () => {
			expect(await loadEditorLocale('xx')).toBe(EDITOR_LOCALE_EN);
		});

		it('returns a translated (non-English) locale for "de"', async () => {
			const locale: EditorLocale = await loadEditorLocale('de');
			expect(locale.markdownImported).not.toBe(EDITOR_LOCALE_EN.markdownImported);
			expect(locale).toEqual(deLocale);
		});
	});

	// Bug #8 (#192): every shipped locale must carry a Markdown-import announcement
	// so the a11y live-region message is never an English-only fallback.
	describe.each(ALL_LOCALES)('EDITOR_LOCALE_%s', (_code: string, locale: EditorLocale) => {
		it('has non-empty strings for all required keys', () => {
			for (const key of STRING_KEYS) {
				const value: unknown = locale[key];
				expect(value, `${key} should be a string`).toEqual(expect.any(String));
				expect((value as string).length, `${key} should not be empty`).toBeGreaterThan(0);
			}
		});
	});
});
