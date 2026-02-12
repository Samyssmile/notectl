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
		expect(restored.doc.children[0]?.attrs).toBeUndefined();
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
