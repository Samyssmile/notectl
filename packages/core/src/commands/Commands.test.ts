import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockLength,
	getBlockText,
	getInlineChildren,
	getTextChildren,
	isInlineNode,
} from '../model/Document.js';
import type { Schema } from '../model/Schema.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
	isNodeSelection,
} from '../model/Selection.js';
import { inlineType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { stateBuilder } from '../test/TestUtils.js';
import {
	deleteBackward,
	deleteForward,
	deleteNodeSelection,
	deleteSelectionCommand,
	deleteWordBackward,
	deleteWordForward,
	insertTextCommand,
	isMarkActive,
	isVoidBlock,
	mergeBlockBackward,
	navigateArrowIntoVoid,
	selectAll,
	splitBlockCommand,
	toggleBold,
	toggleItalic,
	toggleMark,
	toggleUnderline,
} from './Commands.js';

describe('Commands', () => {
	describe('toggleMark (collapsed)', () => {
		it('toggles stored marks when selection is collapsed', () => {
			const state = stateBuilder().paragraph('hello', 'b1').cursor('b1', 3).build();

			const tr = toggleBold(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			expect(newState.storedMarks).toEqual([{ type: 'bold' }]);
		});

		it('removes stored mark if already active', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', { marks: [{ type: 'bold' }] })
				.cursor('b1', 3)
				.build();

			const tr = toggleBold(state);
			const newState = state.apply(tr);
			expect(newState.storedMarks).toEqual([]);
		});
	});

	describe('toggleMark (range)', () => {
		it('adds bold to selected range', () => {
			const state = stateBuilder()
				.paragraph('hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.build();

			const tr = toggleBold(state);
			const newState = state.apply(tr);
			const children = getTextChildren(newState.doc.children[0]);
			expect(children[0]?.text).toBe('hello');
			expect(children[0]?.marks).toEqual([{ type: 'bold' }]);
			expect(children[1]?.text).toBe(' world');
			expect(children[1]?.marks).toEqual([]);
		});

		it('removes bold from fully bold range', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', { marks: [{ type: 'bold' }] })
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.build();

			const tr = toggleBold(state);
			const newState = state.apply(tr);
			expect(getTextChildren(newState.doc.children[0])[0]?.marks).toEqual([]);
		});
	});

	describe('toggleMark respects features', () => {
		it('returns null when feature is disabled', () => {
			const state = EditorState.create();
			const tr = toggleBold(state, { bold: false, italic: true, underline: true });
			expect(tr).toBeNull();
		});
	});

	describe('insertTextCommand', () => {
		it('inserts text at cursor', () => {
			const state = stateBuilder().paragraph('', 'b1').cursor('b1', 0).build();

			const tr = insertTextCommand(state, 'hello');
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
			expect(newState.selection.anchor.offset).toBe(5);
		});

		it('replaces selected text', () => {
			const state = stateBuilder()
				.paragraph('hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.build();

			const tr = insertTextCommand(state, 'hi');
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hi world');
		});
	});

	describe('deleteBackward', () => {
		it('deletes one character backward', () => {
			const state = stateBuilder().paragraph('hello', 'b1').cursor('b1', 5).build();

			const tr = deleteBackward(state);
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hell');
		});

		it('merges with previous block at offset 0', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.paragraph('world', 'b2')
				.cursor('b2', 0)
				.build();

			const tr = deleteBackward(state);
			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(getBlockText(newState.doc.children[0])).toBe('helloworld');
		});

		it('returns null at start of first block', () => {
			const state = stateBuilder().paragraph('hello', 'b1').cursor('b1', 0).build();
			expect(deleteBackward(state)).toBeNull();
		});
	});

	describe('deleteForward', () => {
		it('deletes one character forward', () => {
			const state = stateBuilder().paragraph('hello', 'b1').cursor('b1', 0).build();

			const tr = deleteForward(state);
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('ello');
		});
	});

	describe('deleteWordBackward', () => {
		it('deletes entire word backward', () => {
			const state = stateBuilder().paragraph('hello world', 'b1').cursor('b1', 11).build();

			const tr = deleteWordBackward(state);
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hello ');
		});
	});

	describe('splitBlockCommand', () => {
		it('splits block at cursor', () => {
			const state = stateBuilder().paragraph('hello world', 'b1').cursor('b1', 5).build();

			const tr = splitBlockCommand(state);
			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(2);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
		});
	});

	describe('selectAll', () => {
		it('selects from start of first block to end of last block', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.paragraph('world', 'b2')
				.cursor('b1', 0)
				.build();

			const tr = selectAll(state);
			const newState = state.apply(tr);
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(0);
			expect(newState.selection.head.blockId).toBe('b2');
			expect(newState.selection.head.offset).toBe(5);
		});
	});

	describe('isMarkActive', () => {
		it('returns true when cursor is inside bold text', () => {
			const state = stateBuilder()
				.paragraph('bold', 'b1', { marks: [{ type: 'bold' }] })
				.cursor('b1', 2)
				.build();

			expect(isMarkActive(state, 'bold')).toBe(true);
			expect(isMarkActive(state, 'italic')).toBe(false);
		});

		it('uses stored marks when available', () => {
			const state = stateBuilder().paragraph('hello', 'b1').cursor('b1', 3).build();

			// Toggle bold to set stored marks
			const tr = toggleBold(state);
			const newState = state.apply(tr);

			expect(isMarkActive(newState, 'bold')).toBe(true);
		});
	});

	describe('deleteSelectionCommand', () => {
		it('returns null for collapsed selection', () => {
			const state = EditorState.create();
			expect(deleteSelectionCommand(state)).toBeNull();
		});
	});

	describe('combined marks', () => {
		it('applies bold and italic independently', () => {
			let state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.build();

			state = state.apply(toggleBold(state));
			state = state.apply(toggleItalic(state));

			const marks = getTextChildren(state.doc.children[0])[0]?.marks;
			expect(marks).toHaveLength(2);
			expect(marks?.some((m: { type: string }) => m.type === 'bold')).toBe(true);
			expect(marks?.some((m: { type: string }) => m.type === 'italic')).toBe(true);
		});
	});

	describe('InlineNode commands', () => {
		it('deleteBackward removes InlineNode at cursor', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('ab'), createInlineNode(inlineType('img')), createTextNode('cd')],
					'b1',
				),
			]);
			// Cursor right after inline (offset 3)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});

			const tr = deleteBackward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			// InlineNode removed: "ab" + "cd" merged
			expect(getBlockLength(block)).toBe(4);
			expect(getBlockText(block)).toBe('abcd');
		});

		it('deleteForward removes InlineNode at cursor', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('ab'), createInlineNode(inlineType('img')), createTextNode('cd')],
					'b1',
				),
			]);
			// Cursor right before inline (offset 2)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
			});

			const tr = deleteForward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			expect(getBlockLength(block)).toBe(4);
			expect(getBlockText(block)).toBe('abcd');
		});

		it('deleteWordBackward stops at InlineNode boundary', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello'), createInlineNode(inlineType('img')), createTextNode('world')],
					'b1',
				),
			]);
			// Cursor at end of "world" (offset 11)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 11),
			});

			const tr = deleteWordBackward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			// "world" deleted, InlineNode preserved
			const children = getInlineChildren(block);
			expect(children.some((c) => isInlineNode(c))).toBe(true);
			expect(getBlockText(block)).toBe('hello');
		});

		it('deleteWordForward stops at InlineNode boundary', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello'), createInlineNode(inlineType('img')), createTextNode('world')],
					'b1',
				),
			]);
			// Cursor at start (offset 0)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = deleteWordForward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			// "hello" deleted, InlineNode preserved
			const children = getInlineChildren(block);
			expect(children.some((c) => isInlineNode(c))).toBe(true);
		});

		it('deleteWordBackward deletes InlineNode when cursor is right after it', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello'), createInlineNode(inlineType('img')), createTextNode('world')],
					'b1',
				),
			]);
			// Cursor right after inline (offset 6)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 6),
			});

			const tr = deleteWordBackward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			// InlineNode should be deleted
			const children = getInlineChildren(block);
			expect(children.every((c) => !isInlineNode(c))).toBe(true);
		});

		it('selection deletion spanning InlineNode removes it', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('ab'), createInlineNode(inlineType('img')), createTextNode('cd')],
					'b1',
				),
			]);
			// Selection from offset 1 to offset 4: "b" + inline + "c"
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 1 }, { blockId: 'b1', offset: 4 }),
			});

			const tr = deleteSelectionCommand(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			expect(getBlockText(block)).toBe('ad');
			expect(getBlockLength(block)).toBe(2);
		});

		it('isMarkActive skips InlineNodes in range check', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[
						createTextNode('bold', [{ type: 'bold' }]),
						createInlineNode(inlineType('img')),
						createTextNode('bold', [{ type: 'bold' }]),
					],
					'b1',
				),
			]);
			// Selection spanning all content including inline
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 9 }),
			});

			// Bold should be active (all text is bold, InlineNode skipped)
			expect(isMarkActive(state, 'bold')).toBe(true);
		});
	});

	// --- Void Block and NodeSelection Tests ---

	function createVoidSchema(): Schema {
		return {
			nodeTypes: ['paragraph', 'horizontal_rule'],
			markTypes: ['bold', 'italic', 'underline'],
			getNodeSpec: (type: string) => {
				if (type === 'horizontal_rule') {
					return {
						type: 'horizontal_rule',
						isVoid: true,
						toDOM: () => document.createElement('hr'),
					} as ReturnType<NonNullable<Schema['getNodeSpec']>>;
				}
				return undefined;
			},
		};
	}

	function createTableCellSchema(): Schema {
		return {
			nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
			markTypes: ['bold', 'italic', 'underline'],
			getNodeSpec: (type: string) => {
				if (type === 'table' || type === 'table_cell') {
					return {
						type,
						isolating: true,
						toDOM: () => document.createElement('div'),
					} as ReturnType<NonNullable<Schema['getNodeSpec']>>;
				}
				return undefined;
			},
		};
	}

	describe('Void block: deleteNodeSelection', () => {
		it('removes void block and places cursor on previous block', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('horizontal_rule', [], 'hr1'),
			]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = deleteNodeSelection(state, sel);
			if (!tr) return;

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(newState.doc.children[0]?.id).toBe('b1');
			expect(isNodeSelection(newState.selection)).toBe(false);
			if (!isNodeSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b1');
				expect(newState.selection.anchor.offset).toBe(5);
			}
		});

		it('removes void block and places cursor on next block when no previous', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('horizontal_rule', [], 'hr1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = deleteNodeSelection(state, sel);
			if (!tr) return;

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(newState.doc.children[0]?.id).toBe('b2');
			if (!isNodeSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b2');
				expect(newState.selection.anchor.offset).toBe(0);
			}
		});

		it('replaces with empty paragraph when it is the only block', () => {
			const schema = createVoidSchema();
			const doc = createDocument([createBlockNode('horizontal_rule', [], 'hr1')]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = deleteNodeSelection(state, sel);
			if (!tr) return;

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(newState.doc.children[0]?.type).toBe('paragraph');
			const firstBlock = newState.doc.children[0];
			if (!firstBlock) return;
			expect(getBlockText(firstBlock)).toBe('');
			if (!isNodeSelection(newState.selection)) {
				expect(newState.selection.anchor.offset).toBe(0);
			}
		});

		it('removes a selected non-leaf table node and places cursor on previous block', () => {
			const schema: Schema = {
				nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
				markTypes: ['bold', 'italic', 'underline'],
			};
			const table = createBlockNode(
				'table',
				[
					createBlockNode(
						'table_row',
						[
							createBlockNode(
								'table_cell',
								[createBlockNode('paragraph', [createTextNode('')], 'p1')],
								'c1',
							),
						],
						'r1',
					),
				],
				't1',
			);
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				table,
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const sel = createNodeSelection('t1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = deleteNodeSelection(state, sel);
			if (!tr) return;

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(2);
			expect(newState.doc.children[0]?.id).toBe('b1');
			expect(newState.doc.children[1]?.id).toBe('b2');
			expect(isNodeSelection(newState.selection)).toBe(false);
			if (!isNodeSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b1');
				expect(newState.selection.anchor.offset).toBe(5);
			}
		});
	});

	describe('Void block: mergeBlockBackward', () => {
		it('selects void block instead of merging when backspacing into void', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('horizontal_rule', [], 'hr1'),
				createBlockNode('paragraph', [createTextNode('hello')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b2', 0),
				schema,
			});

			const tr = mergeBlockBackward(state);
			if (!tr) return;

			const newState = state.apply(tr);
			// Should create a NodeSelection on the void block, not merge
			expect(newState.doc.children).toHaveLength(2);
			expect(isNodeSelection(newState.selection)).toBe(true);
			if (isNodeSelection(newState.selection)) {
				expect(newState.selection.nodeId).toBe('hr1');
			}
		});
	});

	describe('Void block: deleteForward at end of block before void', () => {
		it('selects void block instead of merging when deleting forward into void', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('horizontal_rule', [], 'hr1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
				schema,
			});

			const tr = deleteForward(state);
			if (!tr) return;

			const newState = state.apply(tr);
			// Should create a NodeSelection on the void block, not merge
			expect(newState.doc.children).toHaveLength(2);
			expect(isNodeSelection(newState.selection)).toBe(true);
			if (isNodeSelection(newState.selection)) {
				expect(newState.selection.nodeId).toBe('hr1');
			}
		});
	});

	describe('Void block: deleteBackward/deleteForward with NodeSelection', () => {
		it('deleteBackward with NodeSelection removes the void block', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('horizontal_rule', [], 'hr1'),
			]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = deleteBackward(state);
			if (!tr) return;

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(newState.doc.children[0]?.id).toBe('b1');
		});

		it('deleteForward with NodeSelection removes the void block', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('horizontal_rule', [], 'hr1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = deleteForward(state);
			if (!tr) return;

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(newState.doc.children[0]?.id).toBe('b2');
		});
	});

	describe('Void block: insertTextCommand with NodeSelection', () => {
		it('creates new paragraph after void block with the text', () => {
			const schema = createVoidSchema();
			const doc = createDocument([createBlockNode('horizontal_rule', [], 'hr1')]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = insertTextCommand(state, 'hello');
			const newState = state.apply(tr);

			// Void block should remain, new paragraph should be inserted after it
			expect(newState.doc.children).toHaveLength(2);
			expect(newState.doc.children[0]?.id).toBe('hr1');
			expect(newState.doc.children[1]?.type).toBe('paragraph');
			const newBlock = newState.doc.children[1];
			if (!newBlock) return;
			expect(getBlockText(newBlock)).toBe('hello');
			// Cursor should be at end of newly inserted text
			if (!isNodeSelection(newState.selection)) {
				expect(newState.selection.anchor.offset).toBe(5);
			}
		});
	});

	describe('Void block: splitBlockCommand with NodeSelection', () => {
		it('creates empty paragraph after the void block', () => {
			const schema = createVoidSchema();
			const doc = createDocument([createBlockNode('horizontal_rule', [], 'hr1')]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = splitBlockCommand(state);
			if (!tr) return;

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(2);
			expect(newState.doc.children[0]?.id).toBe('hr1');
			expect(newState.doc.children[1]?.type).toBe('paragraph');
			const newBlock = newState.doc.children[1];
			if (!newBlock) return;
			expect(getBlockText(newBlock)).toBe('');
			// Cursor should be in the new paragraph
			if (!isNodeSelection(newState.selection)) {
				expect(newState.selection.anchor.offset).toBe(0);
			}
		});
	});

	describe('Void block: navigateArrowIntoVoid', () => {
		it('arrow right at end of block into void creates NodeSelection', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('horizontal_rule', [], 'hr1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
				schema,
			});

			const tr = navigateArrowIntoVoid(state, 'right');
			if (!tr) return;

			const newState = state.apply(tr);
			expect(isNodeSelection(newState.selection)).toBe(true);
			if (isNodeSelection(newState.selection)) {
				expect(newState.selection.nodeId).toBe('hr1');
			}
		});

		it('arrow left at start of block into void creates NodeSelection', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('horizontal_rule', [], 'hr1'),
				createBlockNode('paragraph', [createTextNode('hello')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b2', 0),
				schema,
			});

			const tr = navigateArrowIntoVoid(state, 'left');
			if (!tr) return;

			const newState = state.apply(tr);
			expect(isNodeSelection(newState.selection)).toBe(true);
			if (isNodeSelection(newState.selection)) {
				expect(newState.selection.nodeId).toBe('hr1');
			}
		});

		it('arrow right from NodeSelection to next text block', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('horizontal_rule', [], 'hr1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = navigateArrowIntoVoid(state, 'right');
			if (!tr) return;

			const newState = state.apply(tr);
			expect(isNodeSelection(newState.selection)).toBe(false);
			if (!isNodeSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b2');
				expect(newState.selection.anchor.offset).toBe(0);
			}
		});

		it('arrow left from NodeSelection to previous text block', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('horizontal_rule', [], 'hr1'),
			]);
			const sel = createNodeSelection('hr1', []);
			const state = EditorState.create({ doc, selection: sel, schema });

			const tr = navigateArrowIntoVoid(state, 'left');
			if (!tr) return;

			const newState = state.apply(tr);
			expect(isNodeSelection(newState.selection)).toBe(false);
			if (!isNodeSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b1');
				expect(newState.selection.anchor.offset).toBe(5);
			}
		});

		it('returns null when no adjacent void block', () => {
			const schema = createVoidSchema();
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
				schema,
			});

			const tr = navigateArrowIntoVoid(state, 'right');
			expect(tr).toBeNull();
		});
	});

	describe('Table cell isolation guards', () => {
		it('mergeBlockBackward does not merge paragraphs across table cells', () => {
			const schema = createTableCellSchema();
			const doc = createDocument([
				createBlockNode(
					'table',
					[
						createBlockNode(
							'table_row',
							[
								createBlockNode(
									'table_cell',
									[createBlockNode('paragraph', [createTextNode('A')], 'p1')],
									'c1',
								),
								createBlockNode(
									'table_cell',
									[createBlockNode('paragraph', [createTextNode('B')], 'p2')],
									'c2',
								),
							],
							'r1',
						),
					],
					't1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('p2', 0),
				schema,
			});

			expect(mergeBlockBackward(state)).toBeNull();
		});

		it('deleteForward does not merge paragraphs across table cells', () => {
			const schema = createTableCellSchema();
			const doc = createDocument([
				createBlockNode(
					'table',
					[
						createBlockNode(
							'table_row',
							[
								createBlockNode(
									'table_cell',
									[createBlockNode('paragraph', [createTextNode('A')], 'p1')],
									'c1',
								),
								createBlockNode(
									'table_cell',
									[createBlockNode('paragraph', [createTextNode('B')], 'p2')],
									'c2',
								),
							],
							'r1',
						),
					],
					't1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('p1', 1),
				schema,
			});

			expect(deleteForward(state)).toBeNull();
		});
	});
});
