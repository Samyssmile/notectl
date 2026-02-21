/**
 * EditorThemeController — manages theme lifecycle for a Shadow DOM host.
 * Owns the theme CSSStyleSheet, system-theme media listener, and cleanup.
 */

import { getEditorStyleSheet } from './styles.js';
import { generateThemeCSS } from './theme/ThemeEngine.js';
import { type Theme, ThemePreset, resolveTheme } from './theme/ThemeTokens.js';

export class EditorThemeController {
	private themeStyleSheet: CSSStyleSheet = new CSSStyleSheet();
	private systemThemeQuery: MediaQueryList | null = null;
	private systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null;
	private readonly shadow: ShadowRoot;

	constructor(shadow: ShadowRoot) {
		this.shadow = shadow;
	}

	/** Applies a theme preset or custom Theme to the shadow root. */
	apply(theme: ThemePreset | Theme): void {
		this.cleanupSystemThemeListener();

		if (theme === ThemePreset.System) {
			this.setupSystemThemeListener();
			const resolved: Theme = resolveTheme(this.getSystemTheme());
			this.setThemeStyleSheet(resolved);
		} else {
			this.setThemeStyleSheet(resolveTheme(theme));
		}
	}

	/** Removes the system-theme listener. */
	destroy(): void {
		this.cleanupSystemThemeListener();
	}

	private setThemeStyleSheet(theme: Theme): void {
		this.themeStyleSheet.replaceSync(generateThemeCSS(theme));
		this.shadow.adoptedStyleSheets = [this.themeStyleSheet, getEditorStyleSheet()];
	}

	private setupSystemThemeListener(): void {
		this.systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
		this.systemThemeHandler = (_e: MediaQueryListEvent): void => {
			const resolved: Theme = resolveTheme(this.getSystemTheme());
			this.setThemeStyleSheet(resolved);
		};
		this.systemThemeQuery.addEventListener('change', this.systemThemeHandler);
	}

	private cleanupSystemThemeListener(): void {
		if (this.systemThemeQuery && this.systemThemeHandler) {
			this.systemThemeQuery.removeEventListener('change', this.systemThemeHandler);
		}
		this.systemThemeQuery = null;
		this.systemThemeHandler = null;
	}

	private getSystemTheme(): ThemePreset {
		const prefersDark: boolean = window.matchMedia('(prefers-color-scheme: dark)').matches;
		return prefersDark ? ThemePreset.Dark : ThemePreset.Light;
	}
}
