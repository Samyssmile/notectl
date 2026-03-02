/**
 * InputManager: single facade that encapsulates all input handler lifecycle.
 *
 * EditorView previously created and destroyed InputHandler, KeyboardHandler,
 * PasteHandler, ClipboardHandler, and CompositionTracker directly. This facade
 * consolidates that responsibility so the view layer doesn't need to import
 * concrete input classes, maintaining proper layer separation.
 */

import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { ClipboardHandler } from './ClipboardHandler.js';
import { CompositionTracker } from './CompositionTracker.js';
import type { FileHandlerRegistry } from './FileHandlerRegistry.js';
import { InputHandler } from './InputHandler.js';
import type { InputRuleRegistry } from './InputRuleRegistry.js';
import { KeyboardHandler } from './KeyboardHandler.js';
import type { KeymapRegistry } from './KeymapRegistry.js';
import { PasteHandler } from './PasteHandler.js';

type TextDirectionFn = (element: HTMLElement) => 'ltr' | 'rtl';
type GapCursorNavigateFn = (
	state: EditorState,
	direction: 'left' | 'right' | 'up' | 'down',
	container?: HTMLElement,
) => Transaction | null;

export interface InputManagerDeps {
	readonly getState: () => EditorState;
	readonly dispatch: (tr: Transaction) => void;
	readonly syncSelection: () => void;
	readonly undo: () => void;
	readonly redo: () => void;
	readonly schemaRegistry?: SchemaRegistry;
	readonly keymapRegistry?: KeymapRegistry;
	readonly inputRuleRegistry?: InputRuleRegistry;
	readonly fileHandlerRegistry?: FileHandlerRegistry;
	readonly isReadOnly: () => boolean;
	readonly getTextDirection?: TextDirectionFn;
	readonly navigateFromGapCursor?: GapCursorNavigateFn;
}

export class InputManager {
	readonly compositionTracker: CompositionTracker;
	private readonly inputHandler: InputHandler;
	private readonly keyboardHandler: KeyboardHandler;
	private readonly pasteHandler: PasteHandler;
	private readonly clipboardHandler: ClipboardHandler;

	constructor(contentElement: HTMLElement, deps: InputManagerDeps) {
		this.compositionTracker = new CompositionTracker();

		this.inputHandler = new InputHandler(contentElement, {
			getState: deps.getState,
			dispatch: deps.dispatch,
			syncSelection: deps.syncSelection,
			inputRuleRegistry: deps.inputRuleRegistry,
			isReadOnly: deps.isReadOnly,
			compositionTracker: this.compositionTracker,
		});

		this.keyboardHandler = new KeyboardHandler(contentElement, {
			getState: deps.getState,
			dispatch: deps.dispatch,
			undo: deps.undo,
			redo: deps.redo,
			keymapRegistry: deps.keymapRegistry,
			isReadOnly: deps.isReadOnly,
			compositionTracker: this.compositionTracker,
			getTextDirection: deps.getTextDirection,
			navigateFromGapCursor: deps.navigateFromGapCursor,
		});

		this.pasteHandler = new PasteHandler(contentElement, {
			getState: deps.getState,
			dispatch: deps.dispatch,
			schemaRegistry: deps.schemaRegistry,
			fileHandlerRegistry: deps.fileHandlerRegistry,
			isReadOnly: deps.isReadOnly,
		});

		this.clipboardHandler = new ClipboardHandler(contentElement, {
			getState: deps.getState,
			dispatch: deps.dispatch,
			schemaRegistry: deps.schemaRegistry,
			syncSelection: deps.syncSelection,
			isReadOnly: deps.isReadOnly,
		});
	}

	/** Destroys all input handlers and releases event listeners. */
	destroy(): void {
		this.inputHandler.destroy();
		this.keyboardHandler.destroy();
		this.pasteHandler.destroy();
		this.clipboardHandler.destroy();
	}
}
