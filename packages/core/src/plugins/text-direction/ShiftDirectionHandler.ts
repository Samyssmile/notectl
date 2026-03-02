/**
 * Handles Ctrl+Left-Shift → LTR and Ctrl+Right-Shift → RTL shortcuts.
 *
 * Uses a deferred pattern: sets a pending direction on Ctrl+Shift keydown,
 * and applies it on Shift keyup only if no other key was pressed in between.
 * This prevents conflicts with Ctrl+Shift+<key> shortcuts like Ctrl+Shift+D.
 */

import type { PluginContext } from '../Plugin.js';

export class ShiftDirectionHandler {
	private pendingDir: 'ltr' | 'rtl' | null = null;
	private container: HTMLElement | null = null;

	constructor(private readonly context: PluginContext) {}

	attach(container: HTMLElement): void {
		this.container = container;
		container.addEventListener('keydown', this.onKeydown);
		container.addEventListener('keyup', this.onKeyup);
	}

	detach(): void {
		if (!this.container) return;
		this.container.removeEventListener('keydown', this.onKeydown);
		this.container.removeEventListener('keyup', this.onKeyup);
		this.container = null;
	}

	private readonly onKeydown = (e: KeyboardEvent): void => {
		if (e.key === 'Shift' && e.ctrlKey && !e.altKey && !e.metaKey) {
			if (e.code === 'ShiftLeft') {
				this.pendingDir = 'ltr';
			} else if (e.code === 'ShiftRight') {
				this.pendingDir = 'rtl';
			}
			return;
		}
		// Any other keydown cancels the pending direction change
		this.pendingDir = null;
	};

	private readonly onKeyup = (e: KeyboardEvent): void => {
		if (e.key !== 'Shift' || !this.pendingDir) return;
		const dir: 'ltr' | 'rtl' = this.pendingDir;
		this.pendingDir = null;
		const command: string = dir === 'ltr' ? 'setDirectionLTR' : 'setDirectionRTL';
		this.context.executeCommand(command);
	};
}
