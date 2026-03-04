/**
 * GapCursorPlugin: renders a virtual cursor at boundaries of void blocks
 * where no native browser caret can exist (e.g. between two HRs or at
 * the document edge adjacent to a void block).
 */

import { isGapCursor } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { navigateFromGapCursor } from '../../view/GapCursorNavigation.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import {
	GAP_CURSOR_LOCALE_EN,
	type GapCursorLocale,
	loadGapCursorLocale,
} from './GapCursorLocale.js';

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
	private activeCursorBlockId: BlockId | null = null;
	private activeCursorSide: 'before' | 'after' | null = null;
	private locale: GapCursorLocale = GAP_CURSOR_LOCALE_EN;

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			undefined,
			GAP_CURSOR_LOCALE_EN,
			loadGapCursorLocale,
		);

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

	onReady(): void {
		if (!this.context) return;
		this.syncCursorClass(this.context.getState());
	}

	onStateChange(oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		if (!this.context) return;

		this.syncCursorClass(newState);

		if (!isGapCursor(oldState.selection) && isGapCursor(newState.selection)) {
			this.context.announce(this.locale.gapCursorActive);
		}
	}

	destroy(): void {
		this.clearCursorClass();
		this.context = null;
	}

	private syncCursorClass(state: EditorState): void {
		this.clearCursorClass();
		if (!isGapCursor(state.selection) || !this.context) return;

		const className: string =
			state.selection.side === 'before'
				? 'notectl-gap-cursor--before'
				: 'notectl-gap-cursor--after';

		const blockEl: Element | null = this.context
			.getContainer()
			.querySelector(`[data-block-id="${state.selection.blockId}"]`);
		if (!(blockEl instanceof HTMLElement)) return;

		blockEl.classList.add(className);
		this.activeCursorBlockId = state.selection.blockId;
		this.activeCursorSide = state.selection.side;
	}

	private clearCursorClass(): void {
		if (!this.context || !this.activeCursorBlockId || !this.activeCursorSide) return;

		const blockEl: Element | null = this.context
			.getContainer()
			.querySelector(`[data-block-id="${this.activeCursorBlockId}"]`);
		if (blockEl instanceof HTMLElement) {
			blockEl.classList.remove('notectl-gap-cursor--before', 'notectl-gap-cursor--after');
		}

		this.activeCursorBlockId = null;
		this.activeCursorSide = null;
	}
}
