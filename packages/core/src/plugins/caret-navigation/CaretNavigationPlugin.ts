/**
 * CaretNavigationPlugin: registers platform-aware keymaps for all
 * programmatic movement commands (character, word, line, document).
 *
 * Movement priorities use 'navigation' to match GapCursorPlugin.
 * Also announces block-type changes to screen readers on cross-block navigation.
 */

import {
	extendCharacterBackward,
	extendCharacterForward,
	extendToDocumentEnd,
	extendToDocumentStart,
	moveToDocumentEnd,
	moveToDocumentStart,
} from '../../commands/MovementCommands.js';
import { getBlockTypeLabel } from '../../editor/Announcer.js';
import { isCollapsed, isGapCursor, isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { getTextDirection, isMac } from '../../view/Platform.js';
import {
	extendLineDown,
	extendLineUp,
	extendToLineEnd,
	extendToLineStart,
	extendWordBackward,
	extendWordForward,
	moveLineDown,
	moveLineUp,
	moveToLineEnd,
	moveToLineStart,
	moveWordBackward,
	moveWordForward,
} from '../../view/ViewMovementCommands.js';
import type { Plugin, PluginContext } from '../Plugin.js';

type ViewCommandFn = (container: HTMLElement, state: EditorState) => Transaction | null;
type ViewCommandKey = `${'word' | 'lineboundary' | 'line'}:${'forward' | 'backward'}`;
type ViewCommandLookup = Readonly<Record<ViewCommandKey, ViewCommandFn>>;

const VIEW_MOVE_FNS: ViewCommandLookup = {
	'word:forward': moveWordForward,
	'word:backward': moveWordBackward,
	'lineboundary:forward': moveToLineEnd,
	'lineboundary:backward': moveToLineStart,
	'line:forward': moveLineDown,
	'line:backward': moveLineUp,
};

const VIEW_EXTEND_FNS: ViewCommandLookup = {
	'word:forward': extendWordForward,
	'word:backward': extendWordBackward,
	'lineboundary:forward': extendToLineEnd,
	'lineboundary:backward': extendToLineStart,
	'line:forward': extendLineDown,
	'line:backward': extendLineUp,
};

/** Debounce delay for block-type announcements (ms). */
const ANNOUNCE_DEBOUNCE_MS = 150;

export class CaretNavigationPlugin implements Plugin {
	readonly id = 'caret-navigation';
	readonly name = 'Caret Navigation';
	readonly priority = 4;

	private context: PluginContext | null = null;
	private lastAnnouncedBlockId: BlockId | null = null;
	private announceTimer: ReturnType<typeof setTimeout> | null = null;
	private announce: ((text: string) => void) | null = null;

	init(context: PluginContext): void {
		this.context = context;
		this.announce = (text: string) => context.announce(text);
		const mac: boolean = isMac();

		const keymap: Record<string, () => boolean> = {
			// --- Character movement (no modifier) ---
			// Handled natively by browser for basic cases, but Shift+Arrow
			// needs programmatic extend to correctly clear storedMarks.

			// --- Character extend ---
			'Shift-ArrowRight': () => this.extendCharacterVisual('right'),
			'Shift-ArrowLeft': () => this.extendCharacterVisual('left'),

			// --- Line extend ---
			'Shift-ArrowUp': () => this.viewExtendCommand('backward', 'line'),
			'Shift-ArrowDown': () => this.viewExtendCommand('forward', 'line'),

			// --- Word movement (platform-aware) ---
			...(mac
				? {
						'Alt-ArrowRight': () => this.viewMoveVisual('right', 'word'),
						'Alt-ArrowLeft': () => this.viewMoveVisual('left', 'word'),
						'Shift-Alt-ArrowRight': () => this.viewExtendVisual('right', 'word'),
						'Shift-Alt-ArrowLeft': () => this.viewExtendVisual('left', 'word'),
					}
				: {
						'Mod-ArrowRight': () => this.viewMoveVisual('right', 'word'),
						'Mod-ArrowLeft': () => this.viewMoveVisual('left', 'word'),
						'Mod-Shift-ArrowRight': () => this.viewExtendVisual('right', 'word'),
						'Mod-Shift-ArrowLeft': () => this.viewExtendVisual('left', 'word'),
					}),

			// --- Line boundary movement (platform-aware) ---
			...(mac
				? {
						'Mod-ArrowLeft': () => this.viewMoveVisual('left', 'lineboundary'),
						'Mod-ArrowRight': () => this.viewMoveVisual('right', 'lineboundary'),
						'Mod-Shift-ArrowLeft': () => this.viewExtendVisual('left', 'lineboundary'),
						'Mod-Shift-ArrowRight': () => this.viewExtendVisual('right', 'lineboundary'),
					}
				: {
						Home: () => this.viewMoveCommand('backward', 'lineboundary'),
						End: () => this.viewMoveCommand('forward', 'lineboundary'),
						'Shift-Home': () => this.viewExtendCommand('backward', 'lineboundary'),
						'Shift-End': () => this.viewExtendCommand('forward', 'lineboundary'),
					}),

			// --- Document boundary movement (platform-aware) ---
			...(mac
				? {
						'Mod-ArrowUp': () => this.modelCommand(moveToDocumentStart),
						'Mod-ArrowDown': () => this.modelCommand(moveToDocumentEnd),
						'Mod-Shift-ArrowUp': () => this.modelCommand(extendToDocumentStart),
						'Mod-Shift-ArrowDown': () => this.modelCommand(extendToDocumentEnd),
					}
				: {
						'Mod-Home': () => this.modelCommand(moveToDocumentStart),
						'Mod-End': () => this.modelCommand(moveToDocumentEnd),
						'Mod-Shift-Home': () => this.modelCommand(extendToDocumentStart),
						'Mod-Shift-End': () => this.modelCommand(extendToDocumentEnd),
					}),
		};

		context.registerKeymap(keymap, { priority: 'navigation' });
	}

	/** Announces block-type on cross-block cursor movement (debounced). */
	onStateChange(_oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		const newSel = newState.selection;

		// Only announce for collapsed text selections
		if (!isCollapsed(newSel) || isNodeSelection(newSel) || isGapCursor(newSel)) {
			if (this.announceTimer !== null) {
				clearTimeout(this.announceTimer);
				this.announceTimer = null;
			}
			this.lastAnnouncedBlockId = null;
			return;
		}

		const newBlockId: BlockId = newSel.anchor.blockId;
		if (newBlockId === this.lastAnnouncedBlockId) return;

		// First observed block (initial focus) — remember but don't announce
		if (this.lastAnnouncedBlockId === null) {
			this.lastAnnouncedBlockId = newBlockId;
			return;
		}

		this.lastAnnouncedBlockId = newBlockId;

		// Debounce rapid navigation
		if (this.announceTimer !== null) clearTimeout(this.announceTimer);
		this.announceTimer = setTimeout(() => {
			this.announceTimer = null;
			// Skip if another plugin already announced (e.g. CodeBlockPlugin's "Left code block")
			if (this.context?.hasAnnouncement()) return;
			const block = newState.getBlock(newBlockId);
			if (!block) return;
			const label: string = getBlockTypeLabel(
				block.type,
				block.attrs as Record<string, unknown> | undefined,
			);
			this.announce?.(label);
		}, ANNOUNCE_DEBOUNCE_MS);
	}

	destroy(): void {
		if (this.announceTimer !== null) clearTimeout(this.announceTimer);
		this.announceTimer = null;
		this.announce = null;
		this.context = null;
	}

	/** Dispatches a model-based movement command (no DOM needed). */
	private modelCommand(fn: (state: EditorState) => Transaction | null): boolean {
		if (!this.context) return false;
		const tr: Transaction | null = fn(this.context.getState());
		if (tr) {
			this.context.dispatch(tr);
			return true;
		}
		return false;
	}

	/** Extends selection by one character based on visual left/right intent. */
	private extendCharacterVisual(visual: 'left' | 'right'): boolean {
		if (!this.context) return false;
		const state: EditorState = this.context.getState();
		const dir: 'forward' | 'backward' = this.resolveLogicalHorizontalDirection(state, visual);
		const tr: Transaction | null =
			dir === 'forward' ? extendCharacterForward(state) : extendCharacterBackward(state);
		if (tr) {
			this.context.dispatch(tr);
			return true;
		}
		return false;
	}

	/** Dispatches a view-based movement command (uses container + Selection.modify). */
	private viewMoveCommand(
		direction: 'forward' | 'backward',
		granularity: 'word' | 'lineboundary' | 'line',
	): boolean {
		return this.dispatchViewCommand(VIEW_MOVE_FNS, direction, granularity);
	}

	/** Dispatches a view-based move command with visual direction mapping for RTL. */
	private viewMoveVisual(
		visual: 'left' | 'right',
		granularity: 'word' | 'lineboundary',
	): boolean {
		if (!this.context) return false;
		const dir: 'forward' | 'backward' = this.resolveLogicalHorizontalDirection(
			this.context.getState(),
			visual,
		);
		return this.viewMoveCommand(dir, granularity);
	}

	/** Dispatches a view-based extend command. */
	private viewExtendCommand(
		direction: 'forward' | 'backward',
		granularity: 'word' | 'lineboundary' | 'line',
	): boolean {
		return this.dispatchViewCommand(VIEW_EXTEND_FNS, direction, granularity);
	}

	private dispatchViewCommand(
		lookup: ViewCommandLookup,
		direction: 'forward' | 'backward',
		granularity: 'word' | 'lineboundary' | 'line',
	): boolean {
		if (!this.context) return false;
		const fn: ViewCommandFn | undefined = lookup[`${granularity}:${direction}`];
		if (!fn) return false;
		const tr: Transaction | null = fn(this.context.getContainer(), this.context.getState());
		if (tr) {
			this.context.dispatch(tr);
			return true;
		}
		return false;
	}

	/** Dispatches a view-based extend command with visual direction mapping for RTL. */
	private viewExtendVisual(
		visual: 'left' | 'right',
		granularity: 'word' | 'lineboundary',
	): boolean {
		if (!this.context) return false;
		const dir: 'forward' | 'backward' = this.resolveLogicalHorizontalDirection(
			this.context.getState(),
			visual,
		);
		return this.viewExtendCommand(dir, granularity);
	}

	/**
	 * Resolves logical movement direction from visual left/right intent.
	 * In RTL blocks, visual directions are mirrored in offset space.
	 */
	private resolveLogicalHorizontalDirection(
		state: EditorState,
		visual: 'left' | 'right',
	): 'forward' | 'backward' {
		const sel = state.selection;
		if (isNodeSelection(sel) || isGapCursor(sel)) {
			return visual === 'left' ? 'backward' : 'forward';
		}
		const blockEl: Element | null = this.context?.getContainer().querySelector(
			`[data-block-id="${sel.head.blockId}"]`,
		);
		const isRtl: boolean = blockEl instanceof HTMLElement && getTextDirection(blockEl) === 'rtl';
		if (!isRtl) return visual === 'left' ? 'backward' : 'forward';
		return visual === 'left' ? 'forward' : 'backward';
	}
}
