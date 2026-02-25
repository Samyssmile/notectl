/**
 * GapCursorPlugin: renders a virtual cursor at boundaries of void blocks
 * where no native browser caret can exist (e.g. between two HRs or at
 * the document edge adjacent to a void block).
 */

import { isGapCursor } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { navigateFromGapCursor } from '../../view/CaretNavigation.js';
import type { Plugin, PluginContext } from '../Plugin.js';

const GAP_CURSOR_CLASS = 'notectl-gap-cursor';

const GAP_CURSOR_CSS = `
.${GAP_CURSOR_CLASS} {
	position: relative;
	display: block;
	height: 0;
	pointer-events: none;
}
.${GAP_CURSOR_CLASS}::before {
	content: '';
	display: block;
	position: absolute;
	left: 0;
	width: 100%;
	height: 1px;
	background: currentColor;
	animation: notectl-gap-blink 1.1s step-end infinite;
}
@media (prefers-reduced-motion: reduce) {
	.${GAP_CURSOR_CLASS}::before {
		animation: none;
	}
}
@keyframes notectl-gap-blink {
	50% { opacity: 0; }
}
`;

export class GapCursorPlugin implements Plugin {
	readonly id = 'gap-cursor';
	readonly name = 'Gap Cursor';
	readonly priority = 5;

	private context: PluginContext | null = null;
	private gapElement: HTMLElement | null = null;

	init(context: PluginContext): void {
		this.context = context;

		context.registerStyleSheet(GAP_CURSOR_CSS);

		const directions: Record<string, 'left' | 'right' | 'up' | 'down'> = {
			ArrowLeft: 'left',
			ArrowRight: 'right',
			ArrowUp: 'up',
			ArrowDown: 'down',
		};

		const keymap: Record<string, () => boolean> = {};
		for (const [key, dir] of Object.entries(directions)) {
			keymap[key] = (): boolean => {
				const state: EditorState = context.getState();
				if (!isGapCursor(state.selection)) return false;

				const tr: Transaction | null = navigateFromGapCursor(state, dir);
				if (tr) {
					context.dispatch(tr);
					return true;
				}
				return false;
			};
		}

		context.registerKeymap(keymap, { priority: 'navigation' });
	}

	onStateChange(oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		this.removeGapElement();

		if (!isGapCursor(newState.selection)) return;

		const container: HTMLElement | undefined = this.context?.getContainer();
		if (!container) return;

		const sel = newState.selection;
		const blockEl: Element | null = container.querySelector(`[data-block-id="${sel.blockId}"]`);
		if (!blockEl) return;

		const gap: HTMLElement = document.createElement('div');
		gap.className = GAP_CURSOR_CLASS;
		gap.setAttribute('role', 'presentation');
		gap.setAttribute('aria-hidden', 'true');

		if (sel.side === 'before') {
			blockEl.parentNode?.insertBefore(gap, blockEl);
		} else {
			blockEl.parentNode?.insertBefore(gap, blockEl.nextSibling);
		}

		this.gapElement = gap;

		// Announce for screen readers
		if (!isGapCursor(oldState.selection)) {
			this.context?.announce('Gap cursor active. Type to insert new paragraph.');
		}
	}

	destroy(): void {
		this.removeGapElement();
		this.context = null;
	}

	private removeGapElement(): void {
		if (this.gapElement) {
			this.gapElement.remove();
			this.gapElement = null;
		}
	}
}
