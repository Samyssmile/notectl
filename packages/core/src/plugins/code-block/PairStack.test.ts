import { describe, expect, it } from 'vitest';
import { createPosition } from '../../model/Selection.js';
import { blockId } from '../../model/TypeBrands.js';
import { Mapping } from '../../state/Mapping.js';
import type { StepMap } from '../../state/Mapping.js';
import { PairStack } from './PairStack.js';

const B1 = blockId('b1');
const B2 = blockId('b2');

describe('PairStack', () => {
	it('push and take recover a pushed entry', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 4), ')');
		expect(stack.size).toBe(1);
		const entry = stack.take(B1, 4);
		expect(entry?.char).toBe(')');
		expect(stack.size).toBe(0);
	});

	it('peek returns the entry without removing it', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 3), '}');
		expect(stack.peek(B1, 3)?.char).toBe('}');
		expect(stack.size).toBe(1);
	});

	it('take returns undefined for unknown positions', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 5), ']');
		expect(stack.take(B1, 4)).toBeUndefined();
		expect(stack.take(B2, 5)).toBeUndefined();
		expect(stack.size).toBe(1);
	});

	it('clearBlock removes all entries for a block', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 1), ')');
		stack.push(createPosition(B1, 5), ']');
		stack.push(createPosition(B2, 2), '}');
		stack.clearBlock(B1);
		expect(stack.sizeForBlock(B1)).toBe(0);
		expect(stack.sizeForBlock(B2)).toBe(1);
	});

	it('clear removes every entry', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 1), ')');
		stack.push(createPosition(B2, 2), '}');
		stack.clear();
		expect(stack.size).toBe(0);
	});

	it('migrate: shift map (insert before) moves position to the right', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 5), ')');
		const map: StepMap = { type: 'shift', blockId: B1, from: 2, to: 2, newLen: 3 };
		stack.migrate(Mapping.from([map]));
		expect(stack.peek(B1, 8)?.char).toBe(')');
	});

	it('migrate: shift map (insert after) leaves position untouched', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 5), ')');
		const map: StepMap = { type: 'shift', blockId: B1, from: 7, to: 7, newLen: 2 };
		stack.migrate(Mapping.from([map]));
		expect(stack.peek(B1, 5)?.char).toBe(')');
	});

	it('migrate: shift map (insert AT position) stays left of inserted text (assoc=+1)', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 5), ')');
		const map: StepMap = { type: 'shift', blockId: B1, from: 5, to: 5, newLen: 3 };
		stack.migrate(Mapping.from([map]));
		// assoc=+1 → close-char sticks to right of inserted chars
		expect(stack.peek(B1, 8)?.char).toBe(')');
	});

	it('migrate: delete that removes the tracked char drops the entry', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 5), ')');
		const map: StepMap = { type: 'shift', blockId: B1, from: 4, to: 7, newLen: 0 };
		stack.migrate(Mapping.from([map]));
		expect(stack.size).toBe(0);
	});

	it('migrate: split map re-buckets entries past the split point', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 5), ')');
		const map: StepMap = { type: 'split', blockId: B1, offset: 3, newBlockId: B2 };
		stack.migrate(Mapping.from([map]));
		expect(stack.sizeForBlock(B1)).toBe(0);
		expect(stack.peek(B2, 2)?.char).toBe(')'); // 5 - 3 = 2
	});

	it('migrate: merge map moves entries to the target block', () => {
		const stack = new PairStack();
		stack.push(createPosition(B2, 4), ']');
		const map: StepMap = {
			type: 'merge',
			targetBlockId: B1,
			sourceBlockId: B2,
			targetLengthBefore: 7,
		};
		stack.migrate(Mapping.from([map]));
		expect(stack.sizeForBlock(B2)).toBe(0);
		expect(stack.peek(B1, 11)?.char).toBe(']');
	});

	it('migrate: blockRemoval drops entries from removed blocks', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 4), ')');
		stack.push(createPosition(B2, 2), '}');
		const map: StepMap = {
			type: 'blockRemoval',
			removedBlockIds: new Set([B1]),
		};
		stack.migrate(Mapping.from([map]));
		expect(stack.sizeForBlock(B1)).toBe(0);
		expect(stack.sizeForBlock(B2)).toBe(1);
	});

	it('migrate: empty mapping is a no-op', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 4), ')');
		stack.migrate(Mapping.empty);
		expect(stack.peek(B1, 4)?.char).toBe(')');
	});

	it('migrate: composition of insert-then-split moves entry into the new block', () => {
		const stack = new PairStack();
		stack.push(createPosition(B1, 5), ')');
		const insertMap: StepMap = { type: 'shift', blockId: B1, from: 1, to: 1, newLen: 2 };
		const splitMap: StepMap = { type: 'split', blockId: B1, offset: 4, newBlockId: B2 };
		stack.migrate(Mapping.from([insertMap, splitMap]));
		// 5 → 7 (after insert), then split at 4 → B2 offset 3
		expect(stack.peek(B2, 3)?.char).toBe(')');
	});
});
