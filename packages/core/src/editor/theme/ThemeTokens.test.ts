import { describe, expect, it } from 'vitest';
import { DARK_THEME, LIGHT_THEME, ThemePreset, createTheme, resolveTheme } from './ThemeTokens.js';
import type { PartialTheme, Theme, ThemePrimitives } from './ThemeTokens.js';

describe('ThemePreset', () => {
	it('has Light, Dark, and System values', () => {
		expect(ThemePreset.Light).toBe('light');
		expect(ThemePreset.Dark).toBe('dark');
		expect(ThemePreset.System).toBe('system');
	});
});

describe('LIGHT_THEME', () => {
	it('has all primitive keys', () => {
		const keys: (keyof ThemePrimitives)[] = [
			'background',
			'foreground',
			'mutedForeground',
			'border',
			'borderFocus',
			'primary',
			'primaryForeground',
			'primaryMuted',
			'surfaceRaised',
			'surfaceOverlay',
			'hoverBackground',
			'activeBackground',
			'danger',
			'dangerMuted',
			'success',
			'shadow',
			'focusRing',
		];
		for (const key of keys) {
			expect(LIGHT_THEME.primitives[key]).toBeDefined();
			expect(typeof LIGHT_THEME.primitives[key]).toBe('string');
		}
	});

	it('has codeBlock overrides', () => {
		expect(LIGHT_THEME.codeBlock).toBeDefined();
		expect(LIGHT_THEME.codeBlock?.background).toBeDefined();
	});

	it('has tooltip overrides', () => {
		expect(LIGHT_THEME.tooltip).toBeDefined();
		expect(LIGHT_THEME.tooltip?.background).toBeDefined();
	});
});

describe('DARK_THEME', () => {
	it('has all primitive keys', () => {
		const keys: (keyof ThemePrimitives)[] = [
			'background',
			'foreground',
			'mutedForeground',
			'border',
			'borderFocus',
			'primary',
			'primaryForeground',
			'primaryMuted',
			'surfaceRaised',
			'surfaceOverlay',
			'hoverBackground',
			'activeBackground',
			'danger',
			'dangerMuted',
			'success',
			'shadow',
			'focusRing',
		];
		for (const key of keys) {
			expect(DARK_THEME.primitives[key]).toBeDefined();
			expect(typeof DARK_THEME.primitives[key]).toBe('string');
		}
	});

	it('differs from light theme in background', () => {
		expect(DARK_THEME.primitives.background).not.toBe(LIGHT_THEME.primitives.background);
	});
});

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

		expect(result.codeBlock).toBe(LIGHT_THEME.codeBlock);
		expect(result.tooltip).toBe(LIGHT_THEME.tooltip);
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
});
