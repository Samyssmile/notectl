import { describe, expect, it } from 'vitest';
import type { TableLocale } from './TableLocale.js';
import { TABLE_LOCALE_EN, loadTableLocale } from './TableLocale.js';
import arLocale from './locales/ar.js';
import deLocale from './locales/de.js';
import esLocale from './locales/es.js';
import frLocale from './locales/fr.js';
import hiLocale from './locales/hi.js';
import ruLocale from './locales/ru.js';
import zhLocale from './locales/zh.js';

const ALL_LOCALES: ReadonlyArray<readonly [string, TableLocale]> = [
	['EN', TABLE_LOCALE_EN],
	['DE', deLocale],
	['ES', esLocale],
	['FR', frLocale],
	['ZH', zhLocale],
	['RU', ruLocale],
	['AR', arLocale],
	['HI', hiLocale],
];

const STRING_KEYS: ReadonlyArray<keyof TableLocale> = [
	'insertRowAbove',
	'insertRowBelow',
	'insertColumnLeft',
	'insertColumnRight',
	'deleteRow',
	'deleteColumn',
	'borderColorLabel',
	'deleteTable',
	'tableActions',
	'menuKeyboardHint',
	'insertRow',
	'insertColumn',
	'addRow',
	'addColumn',
	'tableActionsHint',
	'contextMenuHint',
	'borderColor',
	'defaultColor',
	'noBorders',
	'borderColorPicker',
	'announceBorderReset',
	'insertTable',
	'tableAriaDescription',
];

describe('TableLocale', () => {
	describe('TABLE_LOCALE_EN', () => {
		it('has all required string properties', () => {
			expect(TABLE_LOCALE_EN.insertRowAbove).toBe('Insert Row Above');
			expect(TABLE_LOCALE_EN.deleteTable).toBe('Delete Table');
			expect(TABLE_LOCALE_EN.defaultColor).toBe('Default');
			expect(TABLE_LOCALE_EN.noBorders).toBe('No borders');
			expect(TABLE_LOCALE_EN.insertTable).toBe('Insert Table');
		});

		it('tableAriaLabel produces correct string', () => {
			expect(TABLE_LOCALE_EN.tableAriaLabel(3, 4)).toBe('Table with 3 rows and 4 columns');
		});

		it('announceBorderColorSet produces correct string', () => {
			expect(TABLE_LOCALE_EN.announceBorderColorSet('Red')).toBe('Table border color set to Red');
		});

		it('borderSwatchLabel produces correct string', () => {
			expect(TABLE_LOCALE_EN.borderSwatchLabel('Blue')).toBe('Border Blue');
		});
	});

	describe('loadTableLocale()', () => {
		it('returns English for "en"', async () => {
			const locale: TableLocale = await loadTableLocale('en');
			expect(locale).toBe(TABLE_LOCALE_EN);
		});

		it('falls back to English for unknown language', async () => {
			const locale: TableLocale = await loadTableLocale('xx');
			expect(locale).toBe(TABLE_LOCALE_EN);
		});
	});

	describe.each(ALL_LOCALES)('TABLE_LOCALE_%s', (_code: string, locale: TableLocale) => {
		it('has non-empty strings for all required keys', () => {
			for (const key of STRING_KEYS) {
				const value: unknown = locale[key];
				expect(value, `${key} should be a non-empty string`).toEqual(expect.any(String));
				expect((value as string).length, `${key} should not be empty`).toBeGreaterThan(0);
			}
		});

		it('tableAriaLabel returns a non-empty string', () => {
			const result: string = locale.tableAriaLabel(3, 4);
			expect(result.length).toBeGreaterThan(0);
		});

		it('announceBorderColorSet returns a non-empty string', () => {
			const result: string = locale.announceBorderColorSet('Red');
			expect(result.length).toBeGreaterThan(0);
		});

		it('borderSwatchLabel returns a non-empty string', () => {
			const result: string = locale.borderSwatchLabel('Blue');
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe('German (de)', () => {
		it('has correct German translations', () => {
			expect(deLocale.insertRowAbove).toBe('Zeile oberhalb einfügen');
			expect(deLocale.deleteTable).toBe('Tabelle löschen');
			expect(deLocale.insertTable).toBe('Tabelle einfügen');
		});

		it('tableAriaLabel produces correct German string', () => {
			expect(deLocale.tableAriaLabel(2, 5)).toBe('Tabelle mit 2 Zeilen und 5 Spalten');
		});
	});

	describe('Spanish (es)', () => {
		it('has correct Spanish translations', () => {
			expect(esLocale.insertRowAbove).toBe('Insertar fila arriba');
			expect(esLocale.deleteTable).toBe('Eliminar tabla');
			expect(esLocale.insertTable).toBe('Insertar tabla');
		});

		it('tableAriaLabel produces correct Spanish string', () => {
			expect(esLocale.tableAriaLabel(2, 5)).toBe('Tabla con 2 filas y 5 columnas');
		});
	});

	describe('French (fr)', () => {
		it('has correct French translations', () => {
			expect(frLocale.insertRowAbove).toBe('Insérer une ligne au-dessus');
			expect(frLocale.deleteTable).toBe('Supprimer le tableau');
			expect(frLocale.insertTable).toBe('Insérer un tableau');
		});

		it('tableAriaLabel produces correct French string', () => {
			expect(frLocale.tableAriaLabel(2, 5)).toBe('Tableau avec 2 lignes et 5 colonnes');
		});
	});

	describe('Chinese (zh)', () => {
		it('has correct Chinese translations', () => {
			expect(zhLocale.insertRowAbove).toBe('在上方插入行');
			expect(zhLocale.deleteTable).toBe('删除表格');
			expect(zhLocale.insertTable).toBe('插入表格');
		});

		it('tableAriaLabel produces correct Chinese string', () => {
			expect(zhLocale.tableAriaLabel(2, 5)).toBe('表格，2 行 5 列');
		});
	});

	describe('Russian (ru)', () => {
		it('has correct Russian translations', () => {
			expect(ruLocale.insertRowAbove).toBe('Вставить строку сверху');
			expect(ruLocale.deleteTable).toBe('Удалить таблицу');
			expect(ruLocale.insertTable).toBe('Вставить таблицу');
		});

		it('tableAriaLabel produces correct Russian string', () => {
			expect(ruLocale.tableAriaLabel(2, 5)).toBe('Таблица: 2 строк, 5 столбцов');
		});
	});

	describe('Arabic (ar)', () => {
		it('has correct Arabic translations', () => {
			expect(arLocale.insertRowAbove).toBe('إدراج صف أعلى');
			expect(arLocale.deleteTable).toBe('حذف الجدول');
			expect(arLocale.insertTable).toBe('إدراج جدول');
		});

		it('tableAriaLabel produces correct Arabic string', () => {
			expect(arLocale.tableAriaLabel(2, 5)).toBe('جدول من 2 صفوف و 5 أعمدة');
		});
	});

	describe('Hindi (hi)', () => {
		it('has correct Hindi translations', () => {
			expect(hiLocale.insertRowAbove).toBe('ऊपर पंक्ति डालें');
			expect(hiLocale.deleteTable).toBe('तालिका हटाएं');
			expect(hiLocale.insertTable).toBe('तालिका डालें');
		});

		it('tableAriaLabel produces correct Hindi string', () => {
			expect(hiLocale.tableAriaLabel(2, 5)).toBe('तालिका: 2 पंक्तियां और 5 स्तंभ');
		});
	});
});
