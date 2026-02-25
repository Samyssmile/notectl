import { describe, expect, it } from 'vitest';
import { blockId, markType } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { isAllowedInReadonly, isSelectionOnlyTransaction } from './ReadonlyGuard.js';
import { TransactionBuilder } from './Transaction.js';

function makeState(): EditorState {
	return EditorState.create();
}

describe('ReadonlyGuard', () => {
	describe('isSelectionOnlyTransaction', () => {
		it('returns true for a transaction with zero steps', () => {
			const state = makeState();
			const tr = state.transaction('input').build();
			expect(isSelectionOnlyTransaction(tr)).toBe(true);
		});

		it('returns true for setStoredMarks-only steps', () => {
			const state = makeState();
			const tr = state
				.transaction('input')
				.setStoredMarks([{ type: markType('bold') }], null)
				.build();
			expect(isSelectionOnlyTransaction(tr)).toBe(true);
		});

		it('returns false for a transaction with mutating steps', () => {
			const bid = blockId('b1');
			const builder = new TransactionBuilder(
				{ anchor: { blockId: bid, offset: 0 }, head: { blockId: bid, offset: 0 } },
				null,
				'input',
			);
			const tr = builder.insertText(bid, 0, 'hello', []).build();
			expect(isSelectionOnlyTransaction(tr)).toBe(false);
		});

		it('returns false when mutating steps are mixed with setStoredMarks', () => {
			const bid = blockId('b1');
			const builder = new TransactionBuilder(
				{ anchor: { blockId: bid, offset: 0 }, head: { blockId: bid, offset: 0 } },
				null,
				'input',
			);
			const tr = builder
				.setStoredMarks([{ type: markType('bold') }], null)
				.insertText(bid, 0, 'x', [])
				.build();
			expect(isSelectionOnlyTransaction(tr)).toBe(false);
		});
	});

	describe('isAllowedInReadonly', () => {
		it('returns true when metadata.readonlyAllowed is set', () => {
			const state = makeState();
			const tr = state.transaction('command').readonlyAllowed().build();
			expect(isAllowedInReadonly(tr)).toBe(true);
		});

		it('returns true for selection-only transactions', () => {
			const state = makeState();
			const tr = state.transaction('input').build();
			expect(isAllowedInReadonly(tr)).toBe(true);
		});

		it('returns false for mutating transactions without readonlyAllowed', () => {
			const bid = blockId('b1');
			const builder = new TransactionBuilder(
				{ anchor: { blockId: bid, offset: 0 }, head: { blockId: bid, offset: 0 } },
				null,
				'command',
			);
			const tr = builder.insertText(bid, 0, 'text', []).build();
			expect(isAllowedInReadonly(tr)).toBe(false);
		});

		it('returns true for mutating transactions with readonlyAllowed metadata', () => {
			const bid = blockId('b1');
			const builder = new TransactionBuilder(
				{ anchor: { blockId: bid, offset: 0 }, head: { blockId: bid, offset: 0 } },
				null,
				'command',
			);
			const tr = builder.insertText(bid, 0, 'text', []).readonlyAllowed().build();
			expect(isAllowedInReadonly(tr)).toBe(true);
		});
	});
});
