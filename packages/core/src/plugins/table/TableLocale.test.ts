import { describe, expect, it } from 'vitest';
import type { TableLocale } from './TableLocale.js';
import {
	TABLE_LOCALE_AR,
	TABLE_LOCALE_DE,
	TABLE_LOCALE_EN,
	TABLE_LOCALE_ES,
	TABLE_LOCALE_FR,
	TABLE_LOCALE_HI,
	TABLE_LOCALE_RU,
	TABLE_LOCALE_ZH,
} from './TableLocale.js';

const ALL_LOCALES: ReadonlyArray<readonly [string, TableLocale]> = [
	['EN', TABLE_LOCALE_EN],
	['DE', TABLE_LOCALE_DE],
	['ES', TABLE_LOCALE_ES],
	['FR', TABLE_LOCALE_FR],
	['ZH', TABLE_LOCALE_ZH],
	['RU', TABLE_LOCALE_RU],
	['AR', TABLE_LOCALE_AR],
	['HI', TABLE_LOCALE_HI],
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

	describe('TABLE_LOCALE_DE', () => {
		it('has correct German translations', () => {
			expect(TABLE_LOCALE_DE.insertRowAbove).toBe('Zeile oberhalb einfügen');
			expect(TABLE_LOCALE_DE.deleteTable).toBe('Tabelle löschen');
			expect(TABLE_LOCALE_DE.insertTable).toBe('Tabelle einfügen');
		});

		it('tableAriaLabel produces correct German string', () => {
			expect(TABLE_LOCALE_DE.tableAriaLabel(2, 5)).toBe('Tabelle mit 2 Zeilen und 5 Spalten');
		});
	});

	describe('TABLE_LOCALE_ES', () => {
		it('has correct Spanish translations', () => {
			expect(TABLE_LOCALE_ES.insertRowAbove).toBe('Insertar fila arriba');
			expect(TABLE_LOCALE_ES.deleteTable).toBe('Eliminar tabla');
			expect(TABLE_LOCALE_ES.insertTable).toBe('Insertar tabla');
		});

		it('tableAriaLabel produces correct Spanish string', () => {
			expect(TABLE_LOCALE_ES.tableAriaLabel(2, 5)).toBe('Tabla con 2 filas y 5 columnas');
		});
	});

	describe('TABLE_LOCALE_FR', () => {
		it('has correct French translations', () => {
			expect(TABLE_LOCALE_FR.insertRowAbove).toBe('Insérer une ligne au-dessus');
			expect(TABLE_LOCALE_FR.deleteTable).toBe('Supprimer le tableau');
			expect(TABLE_LOCALE_FR.insertTable).toBe('Insérer un tableau');
		});

		it('tableAriaLabel produces correct French string', () => {
			expect(TABLE_LOCALE_FR.tableAriaLabel(2, 5)).toBe('Tableau avec 2 lignes et 5 colonnes');
		});
	});

	describe('TABLE_LOCALE_ZH', () => {
		it('has correct Chinese translations', () => {
			expect(TABLE_LOCALE_ZH.insertRowAbove).toBe('在上方插入行');
			expect(TABLE_LOCALE_ZH.deleteTable).toBe('删除表格');
			expect(TABLE_LOCALE_ZH.insertTable).toBe('插入表格');
		});

		it('tableAriaLabel produces correct Chinese string', () => {
			expect(TABLE_LOCALE_ZH.tableAriaLabel(2, 5)).toBe('表格，2 行 5 列');
		});
	});

	describe('TABLE_LOCALE_RU', () => {
		it('has correct Russian translations', () => {
			expect(TABLE_LOCALE_RU.insertRowAbove).toBe('Вставить строку сверху');
			expect(TABLE_LOCALE_RU.deleteTable).toBe('Удалить таблицу');
			expect(TABLE_LOCALE_RU.insertTable).toBe('Вставить таблицу');
		});

		it('tableAriaLabel produces correct Russian string', () => {
			expect(TABLE_LOCALE_RU.tableAriaLabel(2, 5)).toBe('Таблица: 2 строк, 5 столбцов');
		});
	});

	describe('TABLE_LOCALE_AR', () => {
		it('has correct Arabic translations', () => {
			expect(TABLE_LOCALE_AR.insertRowAbove).toBe('إدراج صف أعلى');
			expect(TABLE_LOCALE_AR.deleteTable).toBe('حذف الجدول');
			expect(TABLE_LOCALE_AR.insertTable).toBe('إدراج جدول');
		});

		it('tableAriaLabel produces correct Arabic string', () => {
			expect(TABLE_LOCALE_AR.tableAriaLabel(2, 5)).toBe('جدول من 2 صفوف و 5 أعمدة');
		});
	});

	describe('TABLE_LOCALE_HI', () => {
		it('has correct Hindi translations', () => {
			expect(TABLE_LOCALE_HI.insertRowAbove).toBe('ऊपर पंक्ति डालें');
			expect(TABLE_LOCALE_HI.deleteTable).toBe('तालिका हटाएं');
			expect(TABLE_LOCALE_HI.insertTable).toBe('तालिका डालें');
		});

		it('tableAriaLabel produces correct Hindi string', () => {
			expect(TABLE_LOCALE_HI.tableAriaLabel(2, 5)).toBe('तालिका: 2 पंक्तियां और 5 स्तंभ');
		});
	});
});
