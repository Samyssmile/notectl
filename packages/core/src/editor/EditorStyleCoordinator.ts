/**
 * Manages runtime CSS stylesheet registration for the editor's Shadow DOM.
 *
 * Extracted from NotectlEditor to keep the Web Component shell thin.
 * Owns the runtime CSSStyleSheet and coordinates with EditorThemeController.
 */

import {
	createRuntimeStyleSheet,
	registerStyleRoot,
	unregisterStyleRoot,
} from '../style/StyleRuntime.js';
import type { EditorThemeController } from './EditorThemeController.js';

export class EditorStyleCoordinator {
	private runtimeStyleSheet: CSSStyleSheet | null = null;

	/** Sets up the runtime stylesheet and registers the shadow root as a style root. */
	setup(
		shadow: ShadowRoot,
		nonce: string | undefined,
		themeController: EditorThemeController | null,
	): void {
		unregisterStyleRoot(shadow);
		this.runtimeStyleSheet = createRuntimeStyleSheet();

		themeController?.setRuntimeStyleSheets(this.runtimeStyleSheet ? [this.runtimeStyleSheet] : []);

		registerStyleRoot(shadow, {
			nonce,
			sheet: this.runtimeStyleSheet,
		});
	}

	/** Tears down the runtime stylesheet and unregisters the shadow root. */
	teardown(shadow: ShadowRoot | null, themeController: EditorThemeController | null): void {
		if (shadow) {
			unregisterStyleRoot(shadow);
		}
		this.runtimeStyleSheet = null;
		themeController?.setRuntimeStyleSheets([]);
	}
}
