/**
 * Regression tests for issue #227: undoing an `insertInlineNode` or a
 * `setInlineNodeAttr` must survive an intervening edit placed directly after
 * the inline node.
 *
 * The defect was that the inverse steps mapped the node's atomic slot
 * `[offset, offset + 1)` with a sticky-right end. An insertion (or split) at
 * exactly `offset + 1` then dragged the end past the new content, the slot no
 * longer had width 1, and `HistoryManager.undo` silently discarded the whole
 * group while reporting nothing to undo.
 */

import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type InlineNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockText,
	getInlineChildren,
	isInlineNode,
} from '../model/Document.js';
import { type BlockId, blockId, inlineType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { HistoryManager } from './History.js';
import type { Transaction } from './Transaction.js';
import { TransactionBuilder } from './TransactionBuilder.js';

const B1: BlockId = blockId('b1');
const B2: BlockId = blockId('b2');
const MENTION: InlineNode = createInlineNode(inlineType('mention'), { user: 'alice' });

function inlineNodesOf(block: BlockNode | undefined): readonly InlineNode[] {
	if (!block) return [];
	return getInlineChildren(block).filter((c): c is InlineNode => isInlineNode(c));
}

function stateOf(
	children: readonly (ReturnType<typeof createTextNode> | InlineNode)[],
): EditorState {
	const block: BlockNode = createBlockNode(nodeType('paragraph'), children, B1);
	return EditorState.create({ doc: createDocument([block]) });
}

function transaction(
	state: EditorState,
	build: (builder: TransactionBuilder) => void,
	origin: 'input' | 'api',
): Transaction {
	const builder = new TransactionBuilder(state.selection, null, origin, state.doc);
	build(builder);
	return builder.build();
}

/** Applies a user edit and records it as an undo group. */
function applyUserEdit(
	state: EditorState,
	history: HistoryManager,
	build: (builder: TransactionBuilder) => void,
): EditorState {
	const tr: Transaction = transaction(state, build, 'input');
	history.push(tr);
	return state.apply(tr);
}

/** Applies an out-of-band edit and records it as intervening for history. */
function applyInterveningEdit(
	state: EditorState,
	history: HistoryManager,
	build: (builder: TransactionBuilder) => void,
): EditorState {
	const tr: Transaction = transaction(state, build, 'api');
	history.recordIntervening(tr.mapping);
	return state.apply(tr);
}

describe('inline node undo survives edits right after the node (#227)', () => {
	it('undoes insertInlineNode after text was inserted right after the node', () => {
		const history = new HistoryManager();
		// 'a' = [0,1), mention = [1,2), 'b' = [2,3).
		let state: EditorState = stateOf([createTextNode('ab')]);
		state = applyUserEdit(state, history, (b) => b.insertInlineNode(B1, 1, MENTION));
		state = applyInterveningEdit(state, history, (b) => b.insertText(B1, 2, 'Z', []));

		const undone = history.undo(state);

		expect(undone).not.toBeNull();
		const block: BlockNode | undefined = undone?.state.doc.children[0];
		expect(inlineNodesOf(block)).toHaveLength(0);
		expect(block ? getBlockText(block) : '').toBe('aZb');
	});

	it('undoes setInlineNodeAttr after text was inserted right after the node', () => {
		const history = new HistoryManager();
		let state: EditorState = stateOf([createTextNode('a'), MENTION, createTextNode('b')]);
		state = applyUserEdit(state, history, (b) => b.setInlineNodeAttr(B1, 1, { user: 'carol' }));
		state = applyInterveningEdit(state, history, (b) => b.insertText(B1, 2, 'Z', []));

		const undone = history.undo(state);

		expect(undone).not.toBeNull();
		const block: BlockNode | undefined = undone?.state.doc.children[0];
		expect(inlineNodesOf(block).map((n) => n.attrs.user)).toEqual(['alice']);
		expect(block ? getBlockText(block) : '').toBe('aZb');
	});

	it('undoes insertInlineNode after the block was split right after the node', () => {
		const history = new HistoryManager();
		let state: EditorState = stateOf([createTextNode('ab')]);
		state = applyUserEdit(state, history, (b) => b.insertInlineNode(B1, 1, MENTION));
		state = applyInterveningEdit(state, history, (b) => b.splitBlock(B1, 2, B2));

		const undone = history.undo(state);

		expect(undone).not.toBeNull();
		const [first, second] = undone?.state.doc.children ?? [];
		expect(inlineNodesOf(first)).toHaveLength(0);
		expect(first ? getBlockText(first) : '').toBe('a');
		expect(second?.id).toBe(B2);
		expect(second ? getBlockText(second) : '').toBe('b');
	});

	it('undoes insertInlineNode after text was inserted right before the node', () => {
		const history = new HistoryManager();
		let state: EditorState = stateOf([createTextNode('ab')]);
		state = applyUserEdit(state, history, (b) => b.insertInlineNode(B1, 1, MENTION));
		state = applyInterveningEdit(state, history, (b) => b.insertText(B1, 1, 'Z', []));

		const undone = history.undo(state);

		expect(undone).not.toBeNull();
		const block: BlockNode | undefined = undone?.state.doc.children[0];
		expect(inlineNodesOf(block)).toHaveLength(0);
		expect(block ? getBlockText(block) : '').toBe('aZb');
	});

	it('still abandons the group when an intervening edit removed the node', () => {
		const history = new HistoryManager();
		let state: EditorState = stateOf([createTextNode('ab')]);
		state = applyUserEdit(state, history, (b) => b.insertInlineNode(B1, 1, MENTION));
		state = applyInterveningEdit(state, history, (b) => b.removeInlineNode(B1, 1));

		expect(history.undo(state)).toBeNull();
	});

	it('keeps the undone insertInlineNode redoable after the intervening edit', () => {
		const history = new HistoryManager();
		let state: EditorState = stateOf([createTextNode('ab')]);
		state = applyUserEdit(state, history, (b) => b.insertInlineNode(B1, 1, MENTION));
		state = applyInterveningEdit(state, history, (b) => b.insertText(B1, 2, 'Z', []));
		state = history.undo(state)?.state ?? state;

		const redone = history.redo(state);

		expect(redone).not.toBeNull();
		const block: BlockNode | undefined = redone?.state.doc.children[0];
		expect(inlineNodesOf(block)).toEqual([MENTION]);
		expect(block ? getBlockText(block) : '').toBe('aZb');
	});
});
