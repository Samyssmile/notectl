/**
 * GapCursorPlugin: renders a virtual cursor at boundaries of void blocks
 * where no native browser caret can exist (e.g. between two HRs or at
 * the document edge adjacent to a void block).
 */

import type { DecorationSet } from '../../decorations/Decoration.js';
import { node as nodeDecoration } from '../../decorations/Decoration.js';
import { DecorationSet as DecorationSetClass } from '../../decorations/Decoration.js';
import { isGapCursor } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { navigateFromGapCursor } from '../../view/CaretNavigation.js';
import type { Plugin, PluginContext } from '../Plugin.js';

const GAP_CURSOR_CSS = `
.notectl-gap-cursor--before,
.notectl-gap-cursor--after {
	position: relative;
}
.notectl-gap-cursor--before::before {
	content: '';
	display: block;
	position: absolute;
	top: 0;
	inset-inline-start: 0;
	width: 100%;
	height: 1px;
	background: currentColor;
	transform: translateY(-50%);
	pointer-events: none;
	z-index: 1;
	animation: notectl-gap-blink 1.1s step-end infinite;
}
.notectl-gap-cursor--after::after {
	content: '';
	display: block;
	position: absolute;
	bottom: 0;
	inset-inline-start: 0;
	width: 100%;
	height: 1px;
	background: currentColor;
	transform: translateY(50%);
	pointer-events: none;
	z-index: 1;
	animation: notectl-gap-blink 1.1s step-end infinite;
}
@media (prefers-reduced-motion: reduce) {
	.notectl-gap-cursor--before::before,
	.notectl-gap-cursor--after::after {
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

				const container: HTMLElement = context.getContainer();
				const tr: Transaction | null = navigateFromGapCursor(state, dir, container);
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
		if (!this.context) return;

		if (!isGapCursor(oldState.selection) && isGapCursor(newState.selection)) {
			this.context.announce('Gap cursor active. Type to insert new paragraph.');
		}
	}

	decorations(state: EditorState): DecorationSet {
		if (!isGapCursor(state.selection)) return DecorationSetClass.empty;

		const sel = state.selection;
		const cssClass: string =
			sel.side === 'before' ? 'notectl-gap-cursor--before' : 'notectl-gap-cursor--after';

		return DecorationSetClass.create([nodeDecoration(sel.blockId, { class: cssClass })]);
	}

	destroy(): void {
		this.context = null;
	}
}
