import { describe, expect, it } from 'vitest';
import { FORMULA_LOCALE_EN, type FormulaLocale, loadFormulaLocale } from './FormulaLocale.js';
import arLocale from './locales/ar.js';
import deLocale from './locales/de.js';
import esLocale from './locales/es.js';
import frLocale from './locales/fr.js';
import hiLocale from './locales/hi.js';
import ptLocale from './locales/pt.js';
import ruLocale from './locales/ru.js';
import zhLocale from './locales/zh.js';

const ALL_LOCALES: ReadonlyArray<readonly [string, FormulaLocale]> = [
	['EN', FORMULA_LOCALE_EN],
	['DE', deLocale],
	['ES', esLocale],
	['FR', frLocale],
	['PT', ptLocale],
	['ZH', zhLocale],
	['RU', ruLocale],
	['AR', arLocale],
	['HI', hiLocale],
];

const STRING_KEYS: ReadonlyArray<keyof FormulaLocale> = [
	'insertInline',
	'insertInlineTooltip',
	'editFormula',
	'latexLabel',
	'latexPlaceholder',
	'previewLabel',
	'insertButton',
	'updateButton',
	'cancelButton',
	'displayToggle',
	'sizeLabel',
	'sizeDefault',
	'altLabel',
	'altPlaceholder',
	'paletteLabel',
	'emptyPreview',
	'inserted',
	'updated',
	'editing',
	'selected',
	'groupFractions',
	'groupScripts',
	'groupRoots',
	'groupOperators',
	'groupGreek',
	'groupRelations',
	'groupMatrices',
	'groupArrows',
];

describe('FormulaLocale', () => {
	describe('loadFormulaLocale()', () => {
		it('returns English for "en"', async () => {
			expect(await loadFormulaLocale('en')).toBe(FORMULA_LOCALE_EN);
		});

		it('falls back to English for unknown language', async () => {
			expect(await loadFormulaLocale('xx')).toBe(FORMULA_LOCALE_EN);
		});

		it('returns a translated (non-English) locale for "de"', async () => {
			const locale: FormulaLocale = await loadFormulaLocale('de');
			expect(locale.insertInline).not.toBe(FORMULA_LOCALE_EN.insertInline);
			expect(locale).toEqual(deLocale);
		});
	});

	describe.each(ALL_LOCALES)('FORMULA_LOCALE_%s', (_code: string, locale: FormulaLocale) => {
		it('has non-empty strings for all required keys', () => {
			for (const key of STRING_KEYS) {
				const value: unknown = locale[key];
				expect(value, `${key} should be a string`).toEqual(expect.any(String));
				expect((value as string).length, `${key} should not be empty`).toBeGreaterThan(0);
			}
		});

		it('unknownCommand returns a non-empty string that includes the command', () => {
			const result: string = locale.unknownCommand('\\foo');
			expect(result.length).toBeGreaterThan(0);
			expect(result).toContain('\\foo');
		});
	});

	describe('German (de)', () => {
		it('has correct German translations', () => {
			expect(deLocale.insertInline).toBe('Formel einfügen');
			expect(deLocale.cancelButton).toBe('Abbrechen');
			expect(deLocale.displayToggle).toBe('Abgesetzte (Block-)Gleichung');
		});
	});
});
