import { describe, expect, it } from 'vitest';
import { blockId } from '../model/TypeBrands.js';
import { CompositionTracker } from './CompositionTracker.js';

describe('CompositionTracker', () => {
	it('starts with isComposing=false and activeBlockId=null', () => {
		const tracker = new CompositionTracker();
		expect(tracker.isComposing).toBe(false);
		expect(tracker.activeBlockId).toBeNull();
	});

	it('start() sets isComposing=true and records the block ID', () => {
		const tracker = new CompositionTracker();
		const bid = blockId('b1');
		tracker.start(bid);
		expect(tracker.isComposing).toBe(true);
		expect(tracker.activeBlockId).toBe(bid);
	});

	it('end() resets isComposing and activeBlockId', () => {
		const tracker = new CompositionTracker();
		tracker.start(blockId('b1'));
		tracker.end();
		expect(tracker.isComposing).toBe(false);
		expect(tracker.activeBlockId).toBeNull();
	});

	it('supports re-entry: start -> end -> start works correctly', () => {
		const tracker = new CompositionTracker();
		const bid1 = blockId('b1');
		const bid2 = blockId('b2');

		tracker.start(bid1);
		expect(tracker.isComposing).toBe(true);
		expect(tracker.activeBlockId).toBe(bid1);

		tracker.end();
		expect(tracker.isComposing).toBe(false);
		expect(tracker.activeBlockId).toBeNull();

		tracker.start(bid2);
		expect(tracker.isComposing).toBe(true);
		expect(tracker.activeBlockId).toBe(bid2);
	});

	it('start() with a new block ID overwrites the previous one', () => {
		const tracker = new CompositionTracker();
		tracker.start(blockId('b1'));
		tracker.start(blockId('b2'));
		expect(tracker.activeBlockId).toBe(blockId('b2'));
	});
});
