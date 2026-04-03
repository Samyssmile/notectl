import { describe, expect, it } from 'vitest';
import { createInlineNode, getBlockText } from '../model/Document.js';
import { inlineType } from '../model/TypeBrands.js';
import { applyCommand, stateBuilder } from '../test/TestUtils.js';
import { deleteBackward, deleteForward } from './DeleteCommands.js';

// ---------------------------------------------------------------------------
// deleteBackward — grapheme-aware
// ---------------------------------------------------------------------------

describe('deleteBackward', () => {
	it('deletes surrogate-pair emoji as single grapheme', () => {
		const state = stateBuilder().paragraph('\u{1F44B}hello', 'b1').cursor('b1', 2).build();
		const next = applyCommand(state, deleteBackward);
		expect(getBlockText(next.doc.children[0])).toBe('hello');
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 0 } }),
		);
	});

	it('deletes ZWJ sequence as single grapheme', () => {
		const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
		const state = stateBuilder().paragraph(`${family}x`, 'b1').cursor('b1', family.length).build();
		const next = applyCommand(state, deleteBackward);
		expect(getBlockText(next.doc.children[0])).toBe('x');
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 0 } }),
		);
	});

	it('deletes combining character as single grapheme', () => {
		// e + combining acute accent = one grapheme, 2 code units
		const state = stateBuilder().paragraph('e\u0301x', 'b1').cursor('b1', 2).build();
		const next = applyCommand(state, deleteBackward);
		expect(getBlockText(next.doc.children[0])).toBe('x');
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 0 } }),
		);
	});

	it('deletes flag emoji as single grapheme', () => {
		// US flag = 4 code units
		const state = stateBuilder().paragraph('\u{1F1FA}\u{1F1F8}x', 'b1').cursor('b1', 4).build();
		const next = applyCommand(state, deleteBackward);
		expect(getBlockText(next.doc.children[0])).toBe('x');
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 0 } }),
		);
	});

	it('deletes InlineNode as width 1', () => {
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: 'B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 2)
			.build();
		const next = applyCommand(state, deleteBackward);
		expect(getBlockText(next.doc.children[0])).toBe('AB');
	});

	it('deletes emoji after InlineNode correctly', () => {
		// Block: [TextNode("A"), InlineNode, TextNode("👋B")]
		// Cursor at offset 4 (after emoji)
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: '\u{1F44B}B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 4)
			.build();
		const next = applyCommand(state, deleteBackward);
		expect(getBlockText(next.doc.children[0])).toBe('AB');
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 2 } }),
		);
	});
});

// ---------------------------------------------------------------------------
// deleteForward — grapheme-aware
// ---------------------------------------------------------------------------

describe('deleteForward', () => {
	it('deletes surrogate-pair emoji as single grapheme', () => {
		const state = stateBuilder().paragraph('\u{1F44B}hello', 'b1').cursor('b1', 0).build();
		const next = applyCommand(state, deleteForward);
		expect(getBlockText(next.doc.children[0])).toBe('hello');
	});

	it('deletes ZWJ sequence as single grapheme', () => {
		const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
		const state = stateBuilder().paragraph(`${family}x`, 'b1').cursor('b1', 0).build();
		const next = applyCommand(state, deleteForward);
		expect(getBlockText(next.doc.children[0])).toBe('x');
	});

	it('deletes combining character as single grapheme', () => {
		const state = stateBuilder().paragraph('e\u0301x', 'b1').cursor('b1', 0).build();
		const next = applyCommand(state, deleteForward);
		expect(getBlockText(next.doc.children[0])).toBe('x');
	});

	it('deletes flag emoji as single grapheme', () => {
		const state = stateBuilder().paragraph('\u{1F1FA}\u{1F1F8}x', 'b1').cursor('b1', 0).build();
		const next = applyCommand(state, deleteForward);
		expect(getBlockText(next.doc.children[0])).toBe('x');
	});

	it('deletes InlineNode as width 1', () => {
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: 'B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 1)
			.build();
		const next = applyCommand(state, deleteForward);
		expect(getBlockText(next.doc.children[0])).toBe('AB');
	});

	it('deletes emoji after InlineNode correctly', () => {
		// Block: [TextNode("A"), InlineNode, TextNode("👋B")]
		// Cursor at offset 2 (after InlineNode, before emoji)
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: '\u{1F44B}B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 2)
			.build();
		const next = applyCommand(state, deleteForward);
		expect(getBlockText(next.doc.children[0])).toBe('AB');
	});
});
