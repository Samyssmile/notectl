import { describe, expect, it } from 'vitest';
import { createThemeStyleSheet, generateThemeCSS } from './ThemeEngine.js';
import { DARK_THEME, LIGHT_THEME, createTheme } from './ThemeTokens.js';
import type { PartialTheme, Theme } from './ThemeTokens.js';

describe('generateThemeCSS', () => {
	it('generates valid CSS with :host selector', () => {
		const css: string = generateThemeCSS(LIGHT_THEME);
		expect(css).toContain(':host {');
		expect(css).toContain('}');
	});

	it('includes all primitive variables', () => {
		const css: string = generateThemeCSS(LIGHT_THEME);
		expect(css).toContain('--notectl-bg:');
		expect(css).toContain('--notectl-fg:');
		expect(css).toContain('--notectl-fg-muted:');
		expect(css).toContain('--notectl-border:');
		expect(css).toContain('--notectl-border-focus:');
		expect(css).toContain('--notectl-primary:');
		expect(css).toContain('--notectl-primary-fg:');
		expect(css).toContain('--notectl-primary-muted:');
		expect(css).toContain('--notectl-surface-raised:');
		expect(css).toContain('--notectl-surface-overlay:');
		expect(css).toContain('--notectl-hover-bg:');
		expect(css).toContain('--notectl-active-bg:');
		expect(css).toContain('--notectl-danger:');
		expect(css).toContain('--notectl-danger-muted:');
		expect(css).toContain('--notectl-success:');
		expect(css).toContain('--notectl-shadow:');
		expect(css).toContain('--notectl-focus-ring:');
	});

	it('includes component variables when defined', () => {
		const css: string = generateThemeCSS(LIGHT_THEME);
		expect(css).toContain('--notectl-code-block-bg:');
		expect(css).toContain('--notectl-code-block-color:');
		expect(css).toContain('--notectl-tooltip-bg:');
		expect(css).toContain('--notectl-tooltip-fg:');
	});

	it('uses fallbacks for undefined component tokens', () => {
		const minimal: Theme = {
			name: 'minimal',
			primitives: LIGHT_THEME.primitives,
		};
		const css: string = generateThemeCSS(minimal);

		// Toolbar tokens should fall back
		expect(css).toContain('--notectl-toolbar-bg: var(--notectl-surface-raised)');
		expect(css).toContain('--notectl-toolbar-border: var(--notectl-border)');
	});

	it('maps correct values for light theme', () => {
		const css: string = generateThemeCSS(LIGHT_THEME);
		expect(css).toContain('--notectl-bg: #ffffff');
		expect(css).toContain('--notectl-fg: #1a1a1a');
	});

	it('maps correct values for dark theme', () => {
		const css: string = generateThemeCSS(DARK_THEME);
		expect(css).toContain('--notectl-bg: #1e1e2e');
		expect(css).toContain('--notectl-fg: #cdd6f4');
	});

	it('generates different CSS for different themes', () => {
		const lightCSS: string = generateThemeCSS(LIGHT_THEME);
		const darkCSS: string = generateThemeCSS(DARK_THEME);
		expect(lightCSS).not.toBe(darkCSS);
	});

	it('handles custom themes with partial overrides', () => {
		const overrides: PartialTheme = {
			name: 'custom',
			primitives: { primary: '#purple' },
		};
		const custom: Theme = createTheme(LIGHT_THEME, overrides);
		const css: string = generateThemeCSS(custom);

		expect(css).toContain('--notectl-primary: #purple');
		// Other values from base are still present
		expect(css).toContain('--notectl-bg: #ffffff');
	});
});

describe('createThemeStyleSheet', () => {
	it('creates a CSSStyleSheet instance', () => {
		const sheet: CSSStyleSheet = createThemeStyleSheet(LIGHT_THEME);
		expect(sheet).toBeInstanceOf(CSSStyleSheet);
	});
});
