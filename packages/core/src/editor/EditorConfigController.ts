/**
 * Manages runtime configuration and HTML attribute changes for the editor.
 *
 * Consolidates the duplicated logic between `attributeChangedCallback` and
 * `configure()` into a single source of truth.
 */

import type { PluginManager } from '../plugins/PluginManager.js';
import type { EditorThemeController } from './EditorThemeController.js';
import type { NotectlEditorConfig } from './NotectlEditor.js';
import { type PaperSize, isValidPaperSize } from './PaperSize.js';
import { type Theme, ThemePreset } from './theme/ThemeTokens.js';

/** External dependencies the config controller needs to apply changes. */
export interface ConfigControllerDeps {
	readonly contentElement: HTMLElement | null;
	readonly editorWrapper: HTMLElement | null;
	readonly pluginManager: PluginManager | null;
	readonly themeController: EditorThemeController | null;
	readonly applyPaperSize: (size: PaperSize | undefined) => void;
}

export class EditorConfigController {
	private config: NotectlEditorConfig = {};

	/** Returns the current config. */
	getConfig(): NotectlEditorConfig {
		return this.config;
	}

	/** Replaces the entire config (used during init). */
	setConfig(config: NotectlEditorConfig): void {
		this.config = config;
	}

	/** Merges a partial config into the current config. */
	mergeConfig(partial: Partial<NotectlEditorConfig>): void {
		this.config = { ...this.config, ...partial };
	}

	/** Handles an HTML attribute change on the custom element. */
	applyAttribute(name: string, newValue: string | null, deps: ConfigControllerDeps): void {
		if (name === 'placeholder') {
			this.applyPlaceholder(newValue ?? '', deps.contentElement);
		}

		if (name === 'readonly') {
			const isReadonly: boolean = newValue !== null;
			this.applyReadonly(isReadonly, deps.contentElement, deps.pluginManager);
			this.config = { ...this.config, readonly: isReadonly };
		}

		if (name === 'theme') {
			deps.themeController?.apply((newValue as ThemePreset) ?? ThemePreset.Light);
		}

		if (name === 'paper-size') {
			if (newValue === null) {
				deps.applyPaperSize(undefined);
				this.config = { ...this.config, paperSize: undefined };
			} else if (isValidPaperSize(newValue)) {
				deps.applyPaperSize(newValue);
				this.config = { ...this.config, paperSize: newValue };
			}
		}

		if (name === 'dir') {
			this.applyDir(
				newValue === 'ltr' || newValue === 'rtl' ? newValue : undefined,
				deps.contentElement,
				deps.editorWrapper,
			);
		}
	}

	/** Applies a partial runtime config update. */
	applyRuntimeConfig(partial: Partial<NotectlEditorConfig>, deps: ConfigControllerDeps): void {
		if (partial.placeholder !== undefined) {
			this.applyPlaceholder(partial.placeholder, deps.contentElement);
		}

		if (partial.readonly !== undefined) {
			this.applyReadonly(partial.readonly, deps.contentElement, deps.pluginManager);
		}

		if ('paperSize' in partial) {
			deps.applyPaperSize(partial.paperSize);
		}

		if ('dir' in partial) {
			this.applyDir(partial.dir, deps.contentElement, deps.editorWrapper);
		}

		this.config = { ...this.config, ...partial };
	}

	/** Updates the theme in config and applies it. */
	applyTheme(theme: ThemePreset | Theme, themeController: EditorThemeController | null): void {
		this.config = { ...this.config, theme };
		themeController?.apply(theme);
	}

	/** Returns the current theme setting. */
	getTheme(): ThemePreset | Theme {
		return this.config.theme ?? ThemePreset.Light;
	}

	/** Returns whether the editor is read-only. */
	get isReadOnly(): boolean {
		return this.config.readonly ?? false;
	}

	/** Returns the currently configured paper size. */
	getPaperSize(): PaperSize | undefined {
		return this.config.paperSize;
	}

	// --- Private helpers ---

	private applyPlaceholder(value: string, contentEl: HTMLElement | null): void {
		contentEl?.setAttribute('data-placeholder', value);
	}

	private applyReadonly(
		readonly: boolean,
		contentEl: HTMLElement | null,
		pm: PluginManager | null,
	): void {
		if (!contentEl) return;
		contentEl.contentEditable = readonly ? 'false' : 'true';
		if (readonly) {
			contentEl.setAttribute('aria-readonly', 'true');
		} else {
			contentEl.removeAttribute('aria-readonly');
		}
		pm?.setReadOnly(readonly);
	}

	private applyDir(
		dir: 'ltr' | 'rtl' | undefined,
		contentEl: HTMLElement | null,
		wrapper: HTMLElement | null,
	): void {
		if (!contentEl) return;
		if (dir) {
			wrapper?.setAttribute('dir', dir);
			contentEl.setAttribute('dir', dir);
		} else {
			wrapper?.removeAttribute('dir');
			contentEl.removeAttribute('dir');
		}
	}
}
