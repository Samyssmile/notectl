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
import { isMac } from '../../view/Platform.js';
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
			'Shift-ArrowRight': () => this.modelCommand(extendCharacterForward),
			'Shift-ArrowLeft': () => this.modelCommand(extendCharacterBackward),

			// --- Line extend ---
			'Shift-ArrowUp': () => this.viewExtendCommand('backward', 'line'),
			'Shift-ArrowDown': () => this.viewExtendCommand('forward', 'line'),

			// --- Word movement (platform-aware) ---
			...(mac
				? {
						'Alt-ArrowRight': () => this.viewMoveCommand('forward', 'word'),
						'Alt-ArrowLeft': () => this.viewMoveCommand('backward', 'word'),
						'Shift-Alt-ArrowRight': () => this.viewExtendCommand('forward', 'word'),
						'Shift-Alt-ArrowLeft': () => this.viewExtendCommand('backward', 'word'),
					}
				: {
						'Mod-ArrowRight': () => this.viewMoveCommand('forward', 'word'),
						'Mod-ArrowLeft': () => this.viewMoveCommand('backward', 'word'),
						'Mod-Shift-ArrowRight': () => this.viewExtendCommand('forward', 'word'),
						'Mod-Shift-ArrowLeft': () => this.viewExtendCommand('backward', 'word'),
					}),

			// --- Line boundary movement (platform-aware) ---
			...(mac
				? {
						'Mod-ArrowLeft': () => this.viewMoveCommand('backward', 'lineboundary'),
						'Mod-ArrowRight': () => this.viewMoveCommand('forward', 'lineboundary'),
						'Mod-Shift-ArrowLeft': () => this.viewExtendCommand('backward', 'lineboundary'),
						'Mod-Shift-ArrowRight': () => this.viewExtendCommand('forward', 'lineboundary'),
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

	/** Dispatches a view-based movement command (uses container + Selection.modify). */
	private viewMoveCommand(
		direction: 'forward' | 'backward',
		granularity: 'word' | 'lineboundary' | 'line',
	): boolean {
		if (!this.context) return false;
		const container: HTMLElement = this.context.getContainer();
		const state: EditorState = this.context.getState();

		const fn =
			granularity === 'word'
				? direction === 'forward'
					? moveWordForward
					: moveWordBackward
				: granularity === 'lineboundary'
					? direction === 'forward'
						? moveToLineEnd
						: moveToLineStart
					: direction === 'forward'
						? moveLineDown
						: moveLineUp;

		const tr: Transaction | null = fn(container, state);
		if (tr) {
			this.context.dispatch(tr);
			return true;
		}
		return false;
	}

	/** Dispatches a view-based extend command. */
	private viewExtendCommand(
		direction: 'forward' | 'backward',
		granularity: 'word' | 'lineboundary' | 'line',
	): boolean {
		if (!this.context) return false;
		const container: HTMLElement = this.context.getContainer();
		const state: EditorState = this.context.getState();

		const fn =
			granularity === 'word'
				? direction === 'forward'
					? extendWordForward
					: extendWordBackward
				: granularity === 'lineboundary'
					? direction === 'forward'
						? extendToLineEnd
						: extendToLineStart
					: direction === 'forward'
						? extendLineDown
						: extendLineUp;

		const tr: Transaction | null = fn(container, state);
		if (tr) {
			this.context.dispatch(tr);
			return true;
		}
		return false;
	}
}
