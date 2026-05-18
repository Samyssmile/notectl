/**
 * Theming contract regression guards.
 *
 * These tests are deliberately string-based: they protect the three-tier cascade
 * (component → global → fallback) and the forced-colors media query against
 * accidental simplification during future refactors. The actual *visual*
 * resolution is covered by E2E tests; here we just assert the CSS source
 * keeps the contract documented in ARCHITECTURE §9.1.
 */

import { describe, expect, it } from 'vitest';
import { BLOCKQUOTE_CSS } from '../../plugins/blockquote/BlockquoteStyles.js';
import { BASE_CSS } from './base.js';
import { TABLE_CSS } from './table.js';
import { TOOLBAR_CSS } from './toolbar.js';

describe('Theming contract', () => {
	describe('Three-tier cascade (component → global → fallback)', () => {
		it('table border resolves through local override → component token → global token', () => {
			// Cascade order matters: per-table inline --ntbl-border-color must win,
			// then theme component token, then global token.
			expect(TABLE_CSS).toContain(
				'var(--ntbl-border-color, var(--notectl-table-border, var(--notectl-border)))',
			);
		});

		it('table cell background uses component token with transparent fallback', () => {
			expect(TABLE_CSS).toContain('var(--notectl-table-cell-bg, transparent)');
		});

		it('table header background cascades to surface-raised', () => {
			expect(TABLE_CSS).toContain('var(--notectl-table-header-bg, var(--notectl-surface-raised))');
		});

		it('blockquote border cascades to global border token', () => {
			expect(BLOCKQUOTE_CSS).toContain('var(--notectl-blockquote-border, var(--notectl-border))');
		});

		it('toolbar button hover state cascades through component token', () => {
			expect(TOOLBAR_CSS).toContain(
				'var(--notectl-toolbar-button-hover-bg, var(--notectl-hover-bg))',
			);
		});

		it('toolbar button active state cascades through component token', () => {
			expect(TOOLBAR_CSS).toContain(
				'var(--notectl-toolbar-button-active-bg, var(--notectl-active-bg))',
			);
		});
	});

	describe('@property declarations for documented public tokens', () => {
		it('declares core color tokens with <color> syntax and initial-value', () => {
			expect(BASE_CSS).toMatch(/@property\s+--notectl-bg\s*\{[^}]*syntax:\s*'<color>'/);
			expect(BASE_CSS).toMatch(/@property\s+--notectl-fg\s*\{[^}]*syntax:\s*'<color>'/);
			expect(BASE_CSS).toMatch(/@property\s+--notectl-border\s*\{[^}]*syntax:\s*'<color>'/);
			expect(BASE_CSS).toMatch(/@property\s+--notectl-primary\s*\{[^}]*syntax:\s*'<color>'/);
		});

		it('public color tokens declare initial-value so invalid values fall back gracefully', () => {
			// Without an initial-value, an invalid value would un-set the property entirely
			// and break downstream rules. The @property spec requires it for typed registration.
			expect(BASE_CSS).toMatch(/@property\s+--notectl-border[\s\S]*?initial-value:/);
		});
	});

	describe('Forced-colors mode', () => {
		it('declares @media (forced-colors: active) overrides in base CSS', () => {
			expect(BASE_CSS).toContain('@media (forced-colors: active)');
		});

		it('uses system colors (CanvasText / Highlight) under forced-colors', () => {
			// Spot-check: we don't lock the exact rules, but we require system colors
			// rather than hard-coded values so Windows High Contrast Mode stays legible.
			const forcedBlock: RegExpMatchArray | null = BASE_CSS.match(
				/@media\s+\(forced-colors:\s*active\)\s*\{[\s\S]*?\n\}/,
			);
			expect(forcedBlock).not.toBeNull();
			const block: string = forcedBlock?.[0] ?? '';
			expect(block).toMatch(/CanvasText|Highlight|ButtonText/);
		});
	});
});
