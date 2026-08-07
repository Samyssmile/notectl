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

/** Opaque ownership handle for one editor initialization's style registration. */
export interface EditorStyleLease {
	readonly id: symbol;
	readonly shadow: ShadowRoot;
	readonly themeController: EditorThemeController | null;
}

export class EditorStyleCoordinator {
	private runtimeStyleSheet: CSSStyleSheet | null = null;
	private activeLease: EditorStyleLease | null = null;

	/** Sets up the runtime stylesheet and registers the shadow root as a style root. */
	setup(
		shadow: ShadowRoot,
		nonce: string | undefined,
		themeController: EditorThemeController | null,
	): EditorStyleLease {
		if (this.activeLease) {
			this.release(this.activeLease);
		} else {
			// The coordinator may be booting over a declarative or externally reused
			// root whose registration predates this instance.
			unregisterStyleRoot(shadow);
		}
		this.runtimeStyleSheet = createRuntimeStyleSheet();
		const lease: EditorStyleLease = {
			id: Symbol('notectl-style-lease'),
			shadow,
			themeController,
		};
		this.activeLease = lease;

		themeController?.setRuntimeStyleSheets(this.runtimeStyleSheet ? [this.runtimeStyleSheet] : []);

		registerStyleRoot(shadow, {
			nonce,
			sheet: this.runtimeStyleSheet,
		});
		return lease;
	}

	/** Tears down styles only when the caller still owns the active registration. */
	teardown(lease: EditorStyleLease | null): void {
		if (!lease || this.activeLease !== lease) return;
		this.release(lease);
	}

	private release(lease: EditorStyleLease): void {
		unregisterStyleRoot(lease.shadow);
		this.runtimeStyleSheet = null;
		lease.themeController?.setRuntimeStyleSheets([]);
		if (this.activeLease === lease) this.activeLease = null;
	}
}
