/**
 * Tests for InputManager facade.
 */

import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { EditorState } from '../state/EditorState.js';
import { InputManager } from './InputManager.js';

function createTestState(): EditorState {
	const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection('b1', 0),
	});
}

describe('InputManager', () => {
	it('creates without errors and exposes compositionTracker', () => {
		const state = createTestState();
		const element = document.createElement('div');
		const manager = new InputManager(element, {
			getState: () => state,
			dispatch: vi.fn(),
			syncSelection: vi.fn(),
			undo: vi.fn(),
			redo: vi.fn(),
			isReadOnly: () => false,
		});

		expect(manager.compositionTracker).toBeDefined();
		expect(manager.compositionTracker.isComposing).toBe(false);
		expect(manager.compositionTracker.activeBlockId).toBeNull();

		manager.destroy();
	});

	it('destroy can be called without errors', () => {
		const state = createTestState();
		const element = document.createElement('div');
		const manager = new InputManager(element, {
			getState: () => state,
			dispatch: vi.fn(),
			syncSelection: vi.fn(),
			undo: vi.fn(),
			redo: vi.fn(),
			isReadOnly: () => false,
		});

		expect(() => manager.destroy()).not.toThrow();
	});

	it('accepts optional dependencies without errors', () => {
		const state = createTestState();
		const element = document.createElement('div');
		const manager = new InputManager(element, {
			getState: () => state,
			dispatch: vi.fn(),
			syncSelection: vi.fn(),
			undo: vi.fn(),
			redo: vi.fn(),
			isReadOnly: () => false,
			getTextDirection: () => 'ltr',
			navigateFromGapCursor: () => null,
		});

		expect(manager.compositionTracker).toBeDefined();
		manager.destroy();
	});
});
