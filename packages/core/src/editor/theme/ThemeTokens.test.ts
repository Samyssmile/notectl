import { describe, expect, it } from 'vitest';
import { SYNTAX_TOKEN_TYPES } from './SyntaxTokenTypes.js';
import { DARK_THEME, LIGHT_THEME, ThemePreset, createTheme, resolveTheme } from './ThemeTokens.js';
import type { PartialTheme, Theme } from './ThemeTokens.js';

describe('resolveTheme', () => {
	it('resolves Light preset to LIGHT_THEME', () => {
		const result: Theme = resolveTheme(ThemePreset.Light);
		expect(result).toBe(LIGHT_THEME);
	});

	it('resolves Dark preset to DARK_THEME', () => {
		const result: Theme = resolveTheme(ThemePreset.Dark);
		expect(result).toBe(DARK_THEME);
	});

	it('resolves System preset to LIGHT_THEME as default', () => {
		const result: Theme = resolveTheme(ThemePreset.System);
		expect(result).toBe(LIGHT_THEME);
	});

	it('returns a Theme object unchanged', () => {
		const custom: Theme = { ...LIGHT_THEME, name: 'custom' };
		const result: Theme = resolveTheme(custom);
		expect(result).toBe(custom);
	});
});

describe('createTheme', () => {
	it('overrides primitives while keeping base values', () => {
		const overrides: PartialTheme = {
			name: 'custom',
			primitives: { primary: '#ff0000' },
		};
		const result: Theme = createTheme(LIGHT_THEME, overrides);

		expect(result.name).toBe('custom');
		expect(result.primitives.primary).toBe('#ff0000');
		expect(result.primitives.background).toBe(LIGHT_THEME.primitives.background);
	});

	it('overrides component tokens', () => {
		const overrides: PartialTheme = {
			name: 'custom-cb',
			codeBlock: { background: '#000' },
		};
		const result: Theme = createTheme(LIGHT_THEME, overrides);

		expect(result.codeBlock?.background).toBe('#000');
		// Foreground from base is preserved
		expect(result.codeBlock?.foreground).toBe(LIGHT_THEME.codeBlock?.foreground);
	});

	it('preserves base component tokens when no override given', () => {
		const overrides: PartialTheme = {
			name: 'minimal',
			primitives: { background: '#111' },
		};
		const result: Theme = createTheme(LIGHT_THEME, overrides);

		expect(result.inlineCode).toBe(LIGHT_THEME.inlineCode);
		expect(result.codeBlock).toBe(LIGHT_THEME.codeBlock);
		expect(result.tooltip).toBe(LIGHT_THEME.tooltip);
	});

	it('overrides inlineCode tokens', () => {
		const overrides: PartialTheme = {
			name: 'custom-ic',
			inlineCode: { background: '#222' },
		};
		const result: Theme = createTheme(LIGHT_THEME, overrides);

		expect(result.inlineCode?.background).toBe('#222');
		expect(result.inlineCode?.foreground).toBe(LIGHT_THEME.inlineCode?.foreground);
	});

	it('overrides tooltip tokens', () => {
		const overrides: PartialTheme = {
			name: 'custom-tooltip',
			tooltip: { background: '#abc' },
		};
		const result: Theme = createTheme(DARK_THEME, overrides);

		expect(result.tooltip?.background).toBe('#abc');
		expect(result.tooltip?.foreground).toBe(DARK_THEME.tooltip?.foreground);
	});

	it('overrides syntax with TokenStyle objects', () => {
		const overrides: PartialTheme = {
			name: 'bold-keywords',
			codeBlock: {
				syntax: {
					keyword: { color: '#ff0000', fontWeight: 'bold' },
				},
			},
		};
		const result: Theme = createTheme(LIGHT_THEME, overrides);

		expect(result.codeBlock?.syntax?.keyword).toEqual({
			color: '#ff0000',
			fontWeight: 'bold',
		});
		// Other syntax tokens from base are preserved
		expect(result.codeBlock?.syntax?.string).toBe(LIGHT_THEME.codeBlock?.syntax?.string);
	});

	it('preserves base syntax when no syntax override is given', () => {
		const overrides: PartialTheme = {
			name: 'custom-bg',
			codeBlock: { background: '#000' },
		};
		const result: Theme = createTheme(LIGHT_THEME, overrides);

		expect(result.codeBlock?.syntax).toBe(LIGHT_THEME.codeBlock?.syntax);
	});
});

/** WCAG relative luminance for a #rrggbb hex color. */
function relativeLuminance(hex: string): number {
	const channel = (value: number): number => {
		const scaled: number = value / 255;
		return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
	};
	const r: number = Number.parseInt(hex.slice(1, 3), 16);
	const g: number = Number.parseInt(hex.slice(3, 5), 16);
	const b: number = Number.parseInt(hex.slice(5, 7), 16);
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two #rrggbb hex colors. */
function contrastRatio(hexA: string, hexB: string): number {
	const lumA: number = relativeLuminance(hexA);
	const lumB: number = relativeLuminance(hexB);
	const lighter: number = Math.max(lumA, lumB);
	const darker: number = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
}

describe('preset foreground contrast (#217)', () => {
	const WCAG_AA_NORMAL_TEXT = 4.5;

	it.each([LIGHT_THEME, DARK_THEME])(
		'$name preset: primaryForeground is readable on a solid primary background',
		(theme: Theme) => {
			const ratio: number = contrastRatio(
				theme.primitives.primary,
				theme.primitives.primaryForeground,
			);
			expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
		},
	);

	it.each([LIGHT_THEME, DARK_THEME])(
		'$name preset: accentForeground is readable on the editor background',
		(theme: Theme) => {
			const ratio: number = contrastRatio(
				theme.primitives.background,
				theme.primitives.accentForeground,
			);
			expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
		},
	);
});

describe('built-in themes have all token types', () => {
	it('LIGHT_THEME has all canonical syntax token types', () => {
		const syntax = LIGHT_THEME.codeBlock?.syntax;
		expect(syntax).toBeDefined();
		for (const type of SYNTAX_TOKEN_TYPES) {
			expect(syntax?.[type]).toBeDefined();
		}
	});

	it('DARK_THEME has all canonical syntax token types', () => {
		const syntax = DARK_THEME.codeBlock?.syntax;
		expect(syntax).toBeDefined();
		for (const type of SYNTAX_TOKEN_TYPES) {
			expect(syntax?.[type]).toBeDefined();
		}
	});
});
