/**
 * Input handler: intercepts all beforeinput events, maps them to transactions.
 * After text insertion, checks registered InputRules for pattern matches.
 */

import {
	deleteBackward,
	deleteForward,
	deleteSoftLineBackward,
	deleteSoftLineForward,
	deleteWordBackward,
	deleteWordForward,
	insertHardBreakCommand,
	insertTextCommand,
	splitBlockCommand,
} from '../commands/Commands.js';
import { type BlockNode, getInlineChildren, isTextNode } from '../model/Document.js';
import { INLINE_NODE_PLACEHOLDER } from '../model/InputRule.js';
import { isTextSelection } from '../model/Selection.js';
import type { Transaction } from '../state/Transaction.js';

import type { InputRuleRegistry } from '../model/InputRuleRegistry.js';
import type { TextInputInterceptorEntry } from '../model/TextInputInterceptor.js';
import type { EditorState } from '../state/EditorState.js';
import { CompositionTracker } from './CompositionTracker.js';

export type DispatchFn = (tr: Transaction) => void;
export type GetStateFn = () => EditorState;
export type UndoFn = () => void;
export type RedoFn = () => void;

export type SyncSelectionFn = () => void;

export interface InputHandlerOptions {
	getState: GetStateFn;
	dispatch: DispatchFn;
	syncSelection: SyncSelectionFn;
	inputRuleRegistry?: InputRuleRegistry;
	isReadOnly?: () => boolean;
	/**
	 * Gate for live input-rule (Markdown shorthand) processing. When it returns
	 * `false`, typed shorthand like `# ` or `**bold**` stays literal. Evaluated on
	 * each keystroke. Defaults to always enabled.
	 */
	shouldApplyInputRules?: () => boolean;
	compositionTracker?: CompositionTracker;
	getTextInputInterceptors?: () => readonly TextInputInterceptorEntry[];
}

export class InputHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly syncSelection: SyncSelectionFn;
	private readonly inputRuleRegistry?: InputRuleRegistry;
	private readonly isReadOnly: () => boolean;
	private readonly shouldApplyInputRules: () => boolean;
	private readonly compositionTracker: CompositionTracker;
	private readonly getTextInputInterceptors: () => readonly TextInputInterceptorEntry[];
	private compositionCommitHandled = false;

	private readonly handleBeforeInput: (e: InputEvent) => void;
	private readonly handleCompositionStart: (e: CompositionEvent) => void;
	private readonly handleCompositionEnd: (e: CompositionEvent) => void;

	constructor(
		private readonly element: HTMLElement,
		options: InputHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;
		this.syncSelection = options.syncSelection;
		this.inputRuleRegistry = options.inputRuleRegistry;
		this.isReadOnly = options.isReadOnly ?? (() => false);
		this.shouldApplyInputRules = options.shouldApplyInputRules ?? (() => true);
		this.compositionTracker = options.compositionTracker ?? new CompositionTracker();
		this.getTextInputInterceptors = options.getTextInputInterceptors ?? (() => []);

		this.handleBeforeInput = this.onBeforeInput.bind(this);
		this.handleCompositionStart = this.onCompositionStart.bind(this);
		this.handleCompositionEnd = this.onCompositionEnd.bind(this);

		element.addEventListener('beforeinput', this.handleBeforeInput);
		element.addEventListener('compositionstart', this.handleCompositionStart);
		element.addEventListener('compositionend', this.handleCompositionEnd);
	}

	private onBeforeInput(e: InputEvent): void {
		if (this.isReadOnly()) return;

		// During composition, let the browser handle it
		if (this.compositionTracker.isComposing && e.inputType === 'insertCompositionText') {
			return;
		}

		if (!shouldHandleBeforeInput(e.inputType)) {
			return;
		}

		// Sync selection from DOM before processing non-insert operations
		// (handles arrow key / mouse navigation that doesn't go through our state)
		const needsSelectionSync =
			e.inputType !== 'insertText' &&
			e.inputType !== 'insertCompositionText' &&
			e.inputType !== 'insertFromComposition';
		if (needsSelectionSync) {
			this.syncSelection();
		}

		e.preventDefault();

		const state = this.getState();
		let tr: Transaction | null = null;

		switch (e.inputType) {
			case 'insertText':
				if (e.data) {
					tr =
						this.runTextInputInterceptors(e.data, state) ??
						insertTextCommand(state, e.data, 'input');
				}
				break;

			case 'insertReplacementText':
				if (e.data) {
					tr =
						this.runTextInputInterceptors(e.data, state) ??
						insertTextCommand(state, e.data, 'input');
				}
				break;

			case 'insertFromComposition':
				if (e.data) {
					this.compositionCommitHandled = true;
					tr =
						this.runTextInputInterceptors(e.data, state) ??
						insertTextCommand(state, e.data, 'input');
				}
				break;

			case 'insertParagraph':
				tr = splitBlockCommand(state);
				break;

			case 'insertLineBreak':
				tr = insertHardBreakCommand(state);
				break;

			case 'deleteContentBackward':
				tr = deleteBackward(state);
				break;

			case 'deleteContentForward':
				tr = deleteForward(state);
				break;

			case 'deleteWordBackward':
				tr = deleteWordBackward(state);
				break;

			case 'deleteWordForward':
				tr = deleteWordForward(state);
				break;

			case 'deleteSoftLineBackward':
				tr = deleteSoftLineBackward(state);
				break;

			case 'deleteSoftLineForward':
				tr = deleteSoftLineForward(state);
				break;

			case 'deleteByCut':
				// ClipboardHandler owns cut semantics to avoid duplicate deletions.
				break;

			case 'insertFromPaste':
				// Handled by PasteHandler
				break;

			case 'insertFromDrop':
				// Handled by PasteHandler
				break;

			case 'formatBold':
			case 'formatItalic':
			case 'formatUnderline':
			case 'historyUndo':
			case 'historyRedo':
				// Handled by KeyboardHandler — just prevent default
				break;
		}

		if (tr) {
			this.dispatch(tr);

			// Check input rules after text insertion
			if (e.inputType === 'insertText' || e.inputType === 'insertReplacementText') {
				this.checkInputRules();
			}
		}
	}

	private onCompositionStart(_e: CompositionEvent): void {
		const state = this.getState();
		if (!isTextSelection(state.selection)) return;
		this.compositionCommitHandled = false;
		this.compositionTracker.start(state.selection.anchor.blockId);
	}

	private onCompositionEnd(e: CompositionEvent): void {
		this.compositionTracker.end();
		if (this.isReadOnly()) return;
		if (this.compositionCommitHandled) {
			this.compositionCommitHandled = false;
			return;
		}
		const composedText = e.data;
		if (!composedText) return;

		const state = this.getState();
		const tr = insertTextCommand(state, composedText, 'input');
		this.dispatch(tr);
	}

	/**
	 * Runs registered text-input interceptors in priority order.
	 * Returns the first non-null transaction, or null to pass through to
	 * the default `insertTextCommand`.
	 */
	private runTextInputInterceptors(text: string, state: EditorState): Transaction | null {
		const entries = this.getTextInputInterceptors();
		if (entries.length === 0) return null;

		for (const entry of entries) {
			const tr = entry.interceptor(text, state);
			if (tr) return tr;
		}
		return null;
	}

	private checkInputRules(): void {
		if (!this.shouldApplyInputRules()) return;
		if (!this.inputRuleRegistry) return;
		const rules = this.inputRuleRegistry.getInputRules();
		if (rules.length === 0) return;

		const state = this.getState();
		if (!isTextSelection(state.selection)) return;
		const { anchor } = state.selection;
		const block = state.getBlock(anchor.blockId);
		if (!block) return;

		// Build the text in MODEL-OFFSET space (inline nodes → one placeholder
		// char) so `match.index`/`end` are real offsets even when inline nodes
		// precede the match. Plain `getBlockText` drops inline nodes (width 0),
		// which desyncs `anchor.offset` (width 1) and corrupts the deleted range.
		const text = blockTextForRules(block);
		const textBefore = text.slice(0, anchor.offset);

		for (const rule of rules) {
			const match = rule.pattern.exec(textBefore);
			if (match) {
				const start = match.index;
				const end = start + match[0].length;
				const tr = rule.handler(state, match, start, end);
				if (tr) {
					this.dispatch(tr);
					return; // Only first matching rule fires
				}
			}
		}
	}

	destroy(): void {
		this.element.removeEventListener('beforeinput', this.handleBeforeInput);
		this.element.removeEventListener('compositionstart', this.handleCompositionStart);
		this.element.removeEventListener('compositionend', this.handleCompositionEnd);
	}
}

/**
 * Renders a block's inline content in model-offset space: text verbatim, each
 * inline node as a single {@link INLINE_NODE_PLACEHOLDER}. Indices into the
 * result equal model offsets, which input-rule handlers feed to step builders.
 */
function blockTextForRules(block: BlockNode): string {
	let text = '';
	for (const child of getInlineChildren(block)) {
		text += isTextNode(child) ? child.text : INLINE_NODE_PLACEHOLDER;
	}
	return text;
}

function shouldHandleBeforeInput(inputType: string): boolean {
	switch (inputType) {
		case 'insertText':
		case 'insertReplacementText':
		case 'insertFromComposition':
		case 'insertParagraph':
		case 'insertLineBreak':
		case 'deleteContentBackward':
		case 'deleteContentForward':
		case 'deleteWordBackward':
		case 'deleteWordForward':
		case 'deleteSoftLineBackward':
		case 'deleteSoftLineForward':
		case 'deleteByCut':
		case 'insertFromPaste':
		case 'insertFromDrop':
		case 'formatBold':
		case 'formatItalic':
		case 'formatUnderline':
		case 'historyUndo':
		case 'historyRedo':
			return true;
		default:
			return false;
	}
}
