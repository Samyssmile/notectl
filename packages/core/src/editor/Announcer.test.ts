import { describe, expect, it } from 'vitest';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import type { Transaction } from '../state/Transaction.js';
import { stateBuilder } from '../test/TestUtils.js';
import { buildAnnouncement, getBlockTypeLabel } from './Announcer.js';

// --- Helpers ---

function makeTr(overrides: Partial<Transaction> = {}): Transaction {
	const sel = createCollapsedSelection(blockId('b1'), 0);
	return {
		steps: [],
		selectionBefore: sel,
		selectionAfter: sel,
		storedMarksAfter: null,
		metadata: { origin: 'command', timestamp: Date.now() },
		...overrides,
	};
}

// --- getBlockTypeLabel ---

describe('getBlockTypeLabel', () => {
	it('returns label for known block types', () => {
		expect(getBlockTypeLabel('paragraph')).toBe('Paragraph');
		expect(getBlockTypeLabel('code_block')).toBe('Code Block');
		expect(getBlockTypeLabel('blockquote')).toBe('Block Quote');
	});

	it('returns heading with level', () => {
		expect(getBlockTypeLabel('heading', { level: 2 })).toBe('Heading 2');
	});

	it('falls back to type name for unknown types', () => {
		expect(getBlockTypeLabel('custom_block')).toBe('custom_block');
	});
});

// --- buildAnnouncement ---

describe('buildAnnouncement', () => {
	it('returns "Undo" for undo transactions', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		const tr = makeTr({
			metadata: { origin: 'history', timestamp: Date.now(), historyDirection: 'undo' },
		});

		expect(buildAnnouncement(state, state, tr)).toBe('Undo');
	});

	it('returns "Redo" for redo transactions', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		const tr = makeTr({
			metadata: { origin: 'history', timestamp: Date.now(), historyDirection: 'redo' },
		});

		expect(buildAnnouncement(state, state, tr)).toBe('Redo');
	});

	it('returns block type label for setBlockType steps', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		const tr = makeTr({
			steps: [
				{
					type: 'setBlockType',
					blockId: blockId('b1'),
					nodeType: 'heading',
					previousType: 'paragraph',
					attrs: { level: 1 },
					previousAttrs: {},
				},
			],
		});

		expect(buildAnnouncement(state, state, tr)).toBe('Heading 1');
	});

	it('returns null when no announcement is warranted', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		const tr = makeTr();

		expect(buildAnnouncement(state, state, tr)).toBeNull();
	});
});
