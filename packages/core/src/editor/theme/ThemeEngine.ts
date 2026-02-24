/**
 * Theme engine — converts a Theme object into CSS custom properties.
 */

import type { Theme } from './ThemeTokens.js';

/** Maps Theme fields to CSS custom property names. */
const VARIABLE_MAP: ReadonlyArray<readonly [string, string]> = [
	// Primitives
	['primitives.background', '--notectl-bg'],
	['primitives.foreground', '--notectl-fg'],
	['primitives.mutedForeground', '--notectl-fg-muted'],
	['primitives.border', '--notectl-border'],
	['primitives.borderFocus', '--notectl-border-focus'],
	['primitives.primary', '--notectl-primary'],
	['primitives.primaryForeground', '--notectl-primary-fg'],
	['primitives.primaryMuted', '--notectl-primary-muted'],
	['primitives.surfaceRaised', '--notectl-surface-raised'],
	['primitives.surfaceOverlay', '--notectl-surface-overlay'],
	['primitives.hoverBackground', '--notectl-hover-bg'],
	['primitives.activeBackground', '--notectl-active-bg'],
	['primitives.danger', '--notectl-danger'],
	['primitives.dangerMuted', '--notectl-danger-muted'],
	['primitives.success', '--notectl-success'],
	['primitives.shadow', '--notectl-shadow'],
	['primitives.focusRing', '--notectl-focus-ring'],
	// Component: toolbar
	['toolbar.background', '--notectl-toolbar-bg'],
	['toolbar.borderColor', '--notectl-toolbar-border'],
	// Component: codeBlock
	['codeBlock.background', '--notectl-code-block-bg'],
	['codeBlock.foreground', '--notectl-code-block-color'],
	['codeBlock.headerBackground', '--notectl-code-block-header-bg'],
	['codeBlock.headerForeground', '--notectl-code-block-header-color'],
	['codeBlock.headerBorder', '--notectl-code-block-header-border'],
	// Component: tooltip
	['tooltip.background', '--notectl-tooltip-bg'],
	['tooltip.foreground', '--notectl-tooltip-fg'],
];

/** Fallbacks for component tokens when not explicitly set. */
const COMPONENT_FALLBACKS: ReadonlyMap<string, string> = new Map([
	['--notectl-toolbar-bg', 'var(--notectl-surface-raised)'],
	['--notectl-toolbar-border', 'var(--notectl-border)'],
	['--notectl-code-block-bg', 'var(--notectl-surface-raised)'],
	['--notectl-code-block-color', 'var(--notectl-fg)'],
	['--notectl-code-block-header-bg', 'var(--notectl-surface-raised)'],
	['--notectl-code-block-header-color', 'var(--notectl-fg-muted)'],
	['--notectl-code-block-header-border', 'var(--notectl-border)'],
	['--notectl-tooltip-bg', 'var(--notectl-fg)'],
	['--notectl-tooltip-fg', 'var(--notectl-bg)'],
]);

/** Resolves a dotted path like 'primitives.background' from a Theme. */
function resolvePath(theme: Theme, path: string): string | undefined {
	const parts: string[] = path.split('.');
	let current: unknown = theme;
	for (const part of parts) {
		if (current === undefined || current === null) return undefined;
		if (typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return typeof current === 'string' ? current : undefined;
}

/** Generates CSS text with all theme custom properties on :host. */
export function generateThemeCSS(theme: Theme): string {
	const lines: string[] = [':host {'];

	for (const [path, cssVar] of VARIABLE_MAP) {
		const value: string | undefined = resolvePath(theme, path);
		if (value !== undefined) {
			lines.push(`\t${cssVar}: ${value};`);
		} else {
			const fallback: string | undefined = COMPONENT_FALLBACKS.get(cssVar);
			if (fallback) {
				lines.push(`\t${cssVar}: ${fallback};`);
			}
		}
	}

	lines.push('}');
	return lines.join('\n');
}

/** Creates a CSSStyleSheet populated with theme CSS variables. */
export function createThemeStyleSheet(theme: Theme): CSSStyleSheet {
	const sheet: CSSStyleSheet = new CSSStyleSheet();
	sheet.replaceSync(generateThemeCSS(theme));
	return sheet;
}
