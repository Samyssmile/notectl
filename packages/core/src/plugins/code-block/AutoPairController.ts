/**
 * Owns the auto-pairing behavior of the code-block plugin: bracket/quote
 * pairing, overtype-on-close, selection wrapping, and dedent-on-close-bracket.
 *
 * Encapsulates the mutable pair state ({@link PairStack} plus the deferred
 * push/take queue) so the plugin stays a thin orchestrator. Positions in the
 * deferred queue are expressed in *post-transaction* space and are reconciled
 * in {@link AutoPairController.syncOnStateChange} after the transaction's
 * mapping migration has run.
 */

import type { CompositionState } from '../../model/CompositionState.js';
import type { BlockNode } from '../../model/Document.js';
import { getBlockText } from '../../model/Document.js';
import {
	createCollapsedSelection,
	createPosition,
	isCollapsed,
	isTextSelection,
	selectionRange,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { TextInputInterceptor } from '../Plugin.js';
import {
	type PairAction,
	type TokenLookup,
	resolvePairAction,
	wrapSelectionPlan,
} from './BracketPairing.js';
import type { ResolvedIndentConfig, ResolvedPairingConfig } from './CodeBlockTypes.js';
import { dedentOnce, getLineRange, isWhitespaceOnlyBeforeOffset } from './IndentHelpers.js';
import { PairStack } from './PairStack.js';

interface AutoPairDeps {
	readonly resolvedIndent: ResolvedIndentConfig;
	readonly resolvedPairing: ResolvedPairingConfig;
	readonly getTokenAt: TokenLookup;
	/** Returns the live composition state, or `null` when the editor is not ready. */
	readonly getCompositionState: () => CompositionState | null;
}

type PendingPairOp =
	| {
			readonly kind: 'push';
			readonly blockId: BlockId;
			readonly offset: number;
			readonly char: string;
	  }
	| { readonly kind: 'take'; readonly blockId: BlockId; readonly offset: number };

export class AutoPairController {
	private readonly resolvedIndent: ResolvedIndentConfig;
	private readonly resolvedPairing: ResolvedPairingConfig;
	private readonly getTokenAt: TokenLookup;
	private readonly getCompositionState: () => CompositionState | null;

	private readonly pairs = new PairStack();
	private readonly pendingPairOps: PendingPairOp[] = [];

	constructor(deps: AutoPairDeps) {
		this.resolvedIndent = deps.resolvedIndent;
		this.resolvedPairing = deps.resolvedPairing;
		this.getTokenAt = deps.getTokenAt;
		this.getCompositionState = deps.getCompositionState;
	}

	/**
	 * The shared pair-tracking stack. Exposed read-only so the keyboard handlers
	 * can consult it for Backspace pair-delete; all mutation flows through this
	 * controller's interceptor and {@link AutoPairController.syncOnStateChange}.
	 */
	get pairStack(): PairStack {
		return this.pairs;
	}

	clear(): void {
		this.pairs.clear();
		this.pendingPairOps.length = 0;
	}

	/**
	 * Reconciles the pair stack after a transaction has been applied: migrates
	 * tracked positions through the transaction mapping, applies the deferred
	 * push/take ops recorded by the interceptor, then drops entries whose host
	 * block is no longer a code block.
	 */
	syncOnStateChange(state: EditorState, tr: Transaction): void {
		if (this.pairs.size > 0 && !tr.mapping.isEmpty) {
			this.pairs.migrate(tr.mapping);
		}

		// Apply any pending push/take operations recorded by the interceptor.
		// Positions in `pendingPairOps` are already expressed in *post-transaction*
		// space, so they must be applied AFTER the migration above (otherwise the
		// migration would shift them again).
		for (const op of this.pendingPairOps) {
			if (op.kind === 'push') {
				this.pairs.push(createPosition(op.blockId, op.offset), op.char);
			} else {
				this.pairs.take(op.blockId, op.offset);
			}
		}
		this.pendingPairOps.length = 0;

		// Clear entries whose host block is no longer a code block.
		for (const step of tr.steps) {
			if (step.type !== 'setBlockType') continue;
			const block: BlockNode | undefined = state.getBlock(step.blockId);
			if (!block || block.type !== 'code_block') {
				this.pairs.clearBlock(step.blockId);
			}
		}
	}

	readonly handleTextInput: TextInputInterceptor = (
		text: string,
		state: EditorState,
	): Transaction | null => {
		// Drop any pending pair ops left over from a previously suppressed
		// transaction. `onStateChange` only fires when a tr reaches `state.apply`;
		// if middleware blocked the last tr, its queued ops would otherwise leak
		// into the next successful cycle with stale offsets.
		this.pendingPairOps.length = 0;

		const composition: CompositionState | null = this.getCompositionState();
		if (!composition) return null;
		if (composition.isComposing) return null;
		if (!isTextSelection(state.selection)) return null;
		// Only single-char inputs trigger pair logic.
		if (text.length !== 1) return null;

		const sel = state.selection;
		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return null;

		// Dedent-on-close-bracket: typing `}`, `]`, `)` on a whitespace-only line
		// reduces leading indent by one step before inserting the char.
		const dedentTr: Transaction | null = this.tryDedentOnCloseBracket(state, block, text);
		if (dedentTr) return dedentTr;

		const action: PairAction = resolvePairAction({
			state,
			block,
			blockId: sel.anchor.blockId,
			char: text,
			config: this.resolvedPairing,
			pairStack: this.pairs,
			getTokenAt: this.getTokenAt,
		});

		switch (action.kind) {
			case 'pair':
				return this.buildAutoPairTransaction(state, sel.anchor.blockId, action.close, text);
			case 'overtype':
				return this.buildOvertypeTransaction(state, sel.anchor.blockId);
			case 'wrap':
				return this.buildWrapTransaction(state, sel.anchor.blockId, action.open, action.close);
			case 'passthrough':
				return null;
		}
	};

	private tryDedentOnCloseBracket(
		state: EditorState,
		block: BlockNode,
		char: string,
	): Transaction | null {
		if (this.resolvedIndent.mode !== 'brackets') return null;
		if (char !== '}' && char !== ']' && char !== ')') return null;

		const sel = state.selection;
		if (!isTextSelection(sel) || !isCollapsed(sel)) return null;

		const text: string = getBlockText(block);
		const offset: number = sel.anchor.offset;
		if (!isWhitespaceOnlyBeforeOffset(text, offset)) return null;

		const { start } = getLineRange(text, offset);
		if (start === offset) return null; // no leading indent on this line

		const blockId: BlockId = sel.anchor.blockId;

		// Combined dedent + overtype: when the next non-whitespace char ahead of
		// the cursor (across any newlines) is a tracked auto-paired close of the
		// same kind, collapse the gap so the user's typed close consumes the
		// auto-paired one instead of producing a duplicate.
		const trackedClosePos: number | null = this.findTrackedCloseAfter(text, offset, char, blockId);
		if (trackedClosePos !== null) {
			return state
				.transaction('input')
				.deleteTextAt(blockId, start, trackedClosePos)
				.setSelection(createCollapsedSelection(blockId, start + 1))
				.build();
		}

		const lineSlice: string = text.slice(start, offset);
		const result = dedentOnce(
			lineSlice,
			this.resolvedIndent.useSpaces,
			this.resolvedIndent.spaceCount,
		);
		if (result.removed.length === 0) return null;

		const newOffset: number = offset - result.removed.length;
		return state
			.transaction('input')
			.deleteTextAt(blockId, newOffset, offset)
			.insertText(blockId, newOffset, char, [])
			.setSelection(createCollapsedSelection(blockId, newOffset + 1))
			.build();
	}

	/**
	 * Scans forward from `offset` through whitespace and newlines for a tracked
	 * auto-paired close char matching `char`. Returns its position or `null` if
	 * any other char (or end-of-text) is encountered first.
	 */
	private findTrackedCloseAfter(
		text: string,
		offset: number,
		char: string,
		blockId: BlockId,
	): number | null {
		for (let i = offset; i < text.length; i++) {
			const ch: string | undefined = text[i];
			if (ch === ' ' || ch === '\t' || ch === '\n') continue;
			if (ch === char) {
				const entry = this.pairs.peek(blockId, i);
				if (entry && entry.char === char) return i;
			}
			return null;
		}
		return null;
	}

	private buildAutoPairTransaction(
		state: EditorState,
		blockId: BlockId,
		closeChar: string,
		openChar: string,
	): Transaction {
		const sel = state.selection;
		if (!isTextSelection(sel)) {
			throw new Error('buildAutoPairTransaction requires a text selection');
		}
		const offset: number = sel.anchor.offset;
		const inserted = `${openChar}${closeChar}`;
		const tr: Transaction = state
			.transaction('input')
			.insertText(blockId, offset, inserted, [])
			.setSelection(createCollapsedSelection(blockId, offset + 1))
			.build();
		// Record the auto-inserted close char so overtype/pair-delete can target it.
		// The position is expressed in post-transaction space; the actual push
		// happens in `syncOnStateChange` after the mapping migration runs.
		this.pendingPairOps.push({
			kind: 'push',
			blockId,
			offset: offset + 1,
			char: closeChar,
		});
		return tr;
	}

	private buildOvertypeTransaction(state: EditorState, blockId: BlockId): Transaction {
		const sel = state.selection;
		if (!isTextSelection(sel)) {
			throw new Error('buildOvertypeTransaction requires a text selection');
		}
		const offset: number = sel.anchor.offset;
		// Schedule the take so it survives the migration phase (the entry's
		// position is in pre-transaction space, so migration will preserve it).
		this.pendingPairOps.push({ kind: 'take', blockId, offset });
		return state
			.transaction('input')
			.setSelection(createCollapsedSelection(blockId, offset + 1))
			.build();
	}

	private buildWrapTransaction(
		state: EditorState,
		blockId: BlockId,
		openChar: string,
		closeChar: string,
	): Transaction {
		const sel = state.selection;
		if (!isTextSelection(sel)) {
			throw new Error('buildWrapTransaction requires a text selection');
		}
		const plan = wrapSelectionPlan(sel, state.getBlockOrder());
		const range = selectionRange(sel, state.getBlockOrder());
		const wasForward: boolean = range.from === sel.anchor;
		const newFrom: number = plan.fromOffset + 1;
		const newTo: number = plan.toOffset + 1;
		const anchorOff: number = wasForward ? newFrom : newTo;
		const headOff: number = wasForward ? newTo : newFrom;

		return state
			.transaction('input')
			.insertText(blockId, plan.toOffset, closeChar, [])
			.insertText(blockId, plan.fromOffset, openChar, [])
			.setSelection({
				anchor: { blockId, offset: anchorOff },
				head: { blockId, offset: headOff },
			})
			.build();
	}
}
