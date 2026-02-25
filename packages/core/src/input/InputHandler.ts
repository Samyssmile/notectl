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
import { getBlockText } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { isNodeSelection } from '../model/Selection.js';
import type { Transaction } from '../state/Transaction.js';

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
	schemaRegistry?: SchemaRegistry;
	isReadOnly?: () => boolean;
	compositionTracker?: CompositionTracker;
}

export class InputHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly syncSelection: SyncSelectionFn;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly isReadOnly: () => boolean;
	private readonly compositionTracker: CompositionTracker;

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
		this.schemaRegistry = options.schemaRegistry;
		this.isReadOnly = options.isReadOnly ?? (() => false);
		this.compositionTracker = options.compositionTracker ?? new CompositionTracker();

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

		e.preventDefault();

		// Sync selection from DOM before processing non-insert operations
		// (handles arrow key / mouse navigation that doesn't go through our state)
		const needsSelectionSync =
			e.inputType !== 'insertText' && e.inputType !== 'insertCompositionText';
		if (needsSelectionSync) {
			this.syncSelection();
		}

		const state = this.getState();
		let tr: Transaction | null = null;

		switch (e.inputType) {
			case 'insertText':
				if (e.data) {
					tr = insertTextCommand(state, e.data, 'input');
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
				tr = deleteBackward(state);
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
			if (e.inputType === 'insertText') {
				this.checkInputRules();
			}
		}
	}

	private onCompositionStart(_e: CompositionEvent): void {
		const state = this.getState();
		if (isNodeSelection(state.selection)) return;
		this.compositionTracker.start(state.selection.anchor.blockId);
	}

	private onCompositionEnd(e: CompositionEvent): void {
		this.compositionTracker.end();
		if (this.isReadOnly()) return;
		const composedText = e.data;
		if (!composedText) return;

		const state = this.getState();
		const tr = insertTextCommand(state, composedText, 'input');
		this.dispatch(tr);
	}

	private checkInputRules(): void {
		if (!this.schemaRegistry) return;
		const rules = this.schemaRegistry.getInputRules();
		if (rules.length === 0) return;

		const state = this.getState();
		if (isNodeSelection(state.selection)) return;
		const { anchor } = state.selection;
		const block = state.getBlock(anchor.blockId);
		if (!block) return;

		const text = getBlockText(block);
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
