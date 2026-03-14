import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getTextChildren,
} from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { EditorState } from './EditorState.js';
import { invertStep, invertTransaction } from './Transaction.js';

describe('SetBlockType', () => {
	it('changes a block type via TransactionBuilder.setBlockType()', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello')], 'b1')]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 0),
		});

		const tr = state.transaction('command').setBlockType('b1', 'heading', { level: 1 }).build();
		const newState = state.apply(tr);

		expect(newState.doc.children[0]?.type).toBe('heading');
		expect(newState.doc.children[0]?.attrs).toEqual({ level: 1 });
	});

	it('preserves block children when changing type', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello')], 'b1')]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 0),
		});

		const tr = state.transaction('command').setBlockType('b1', 'heading').build();
		const newState = state.apply(tr);

		expect(getTextChildren(newState.doc.children[0])[0]?.text).toBe('Hello');
	});

	it('invertStep produces correct inverse for setBlockType', () => {
		const step = {
			type: 'setBlockType' as const,
			blockId: 'b1',
			nodeType: 'heading',
			attrs: { level: 1 },
			previousNodeType: 'paragraph',
			previousAttrs: undefined,
		};

		const inverted = invertStep(step);
		expect(inverted.type).toBe('setBlockType');
		if (inverted.type === 'setBlockType') {
			expect(inverted.nodeType).toBe('paragraph');
			expect(inverted.previousNodeType).toBe('heading');
			expect(inverted.previousAttrs).toEqual({ level: 1 });
		}
	});

	it('undo reverses setBlockType', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello')], 'b1')]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 0),
		});

		const tr = state.transaction('command').setBlockType('b1', 'heading', { level: 2 }).build();
		const newState = state.apply(tr);
		expect(newState.doc.children[0]?.type).toBe('heading');

		// Apply inverse
		const undoTr = invertTransaction(tr);
		const restored = newState.apply(undoTr);
		expect(restored.doc.children[0]?.type).toBe('paragraph');
		expect('attrs' in restored.doc.children[0]).toBe(false);
	});

	it('omits attrs property when no attrs are provided', () => {
		const doc = createDocument([
			createBlockNode('heading', [createTextNode('Title')], 'b1', { level: 1 }),
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 0),
		});

		const tr = state.transaction('command').setBlockType('b1', 'paragraph').build();
		const newState = state.apply(tr);

		const block = newState.doc.children[0];
		expect(block?.type).toBe('paragraph');
		expect('attrs' in block).toBe(false);
	});

	it('does not introduce attrs: undefined across undo/redo cycles', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello')], 'b1')]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 0),
		});

		// Forward: paragraph → heading with attrs
		const tr = state.transaction('command').setBlockType('b1', 'heading', { level: 1 }).build();
		const afterSet = state.apply(tr);
		expect(afterSet.doc.children[0]?.attrs).toEqual({ level: 1 });

		// Undo: heading → paragraph without attrs
		const undoTr = invertTransaction(tr);
		const afterUndo = afterSet.apply(undoTr);
		expect(afterUndo.doc.children[0]?.type).toBe('paragraph');
		expect('attrs' in afterUndo.doc.children[0]).toBe(false);

		// Redo: paragraph → heading with attrs again
		const redoTr = invertTransaction(undoTr);
		const afterRedo = afterUndo.apply(redoTr);
		expect(afterRedo.doc.children[0]?.type).toBe('heading');
		expect(afterRedo.doc.children[0]?.attrs).toEqual({ level: 1 });
	});

	it('throws when block not found', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello')], 'b1')]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 0),
		});

		expect(() => state.transaction('command').setBlockType('nonexistent', 'heading')).toThrow(
			'not found',
		);
	});
});
