import { describe, expect, it } from 'vitest';
import { wrapSelectionInContainer } from '../../commands/ContainerCommands.js';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
	getBlockText,
} from '../../model/Document.js';
import { type Selection, createSelection } from '../../model/Selection.js';
import { blockId, nodeType } from '../../model/TypeBrands.js';
import { parseHTMLToDocument, serializeDocumentToHTML } from '../../serialization/index.js';
import { EditorState } from '../../state/EditorState.js';
import { HistoryManager } from '../../state/History.js';
import { invertTransaction } from '../../state/Transaction.js';
import {
	expectCommandRegistered,
	expectKeyBinding,
	expectNodeSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { assertDefined, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { ListPlugin } from '../list/ListPlugin.js';
import { BlockquotePlugin } from './BlockquotePlugin.js';

// --- Helpers ---

function makeState(
	blocks?: { type: string; text: string; id: string }[],
	cursorBlockId?: string,
	cursorOffset?: number,
) {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id);
	}
	const bid = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'blockquote'], ['bold', 'italic', 'underline']);
	return builder.build();
}

// --- Tests ---

describe('BlockquotePlugin', () => {
	describe('NodeSpec', () => {
		it('registers blockquote NodeSpec', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectNodeSpec(h, 'blockquote');
		});

		it('blockquote NodeSpec creates <blockquote> element', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			const spec = h.getNodeSpec('blockquote');
			assertDefined(spec);
			const { createBlockNode, createTextNode } = await import('../../model/Document.js');
			const el = spec.toDOM(createBlockNode('blockquote', [createTextNode('')], 'test'));
			expect(el?.tagName).toBe('BLOCKQUOTE');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('blockquote element exposes part="blockquote" for ::part() targeting', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			const spec = h.getNodeSpec('blockquote');
			assertDefined(spec);
			const { createBlockNode, createTextNode } = await import('../../model/Document.js');
			const el = spec.toDOM(createBlockNode('blockquote', [createTextNode('')], 'test'));
			expect(el?.getAttribute('part')).toBe('blockquote');
		});
	});

	describe('commands', () => {
		it('registers toggleBlockquote command', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectCommandRegistered(h, 'toggleBlockquote');
		});

		it('registers setBlockquote command', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectCommandRegistered(h, 'setBlockquote');
		});

		// NOTE: the former flat "converts paragraph <-> blockquote" tests were
		// removed; under the B2 container model toggling wraps/lifts blocks
		// instead of swapping a block's type. The replacement behavior is
		// specified in the "issue #136" describe block below.
	});

	describe('keymap registration', () => {
		it('registers Mod-Shift-> keymap', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectKeyBinding(h, 'Mod-Shift->');
		});
	});

	describe('input rules', () => {
		it('registers one input rule', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expect(h.getInputRules().length).toBe(1);
		});

		it('does not register an input rule when inputRule is false', async () => {
			const h = await pluginHarness(new BlockquotePlugin({ inputRule: false }));
			expect(h.getInputRules().length).toBe(0);
		});

		it('input rule pattern matches "> "', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			const rule = h.getInputRules()[0];
			expect(rule?.pattern.test('> ')).toBe(true);
			expect(rule?.pattern.test('>> ')).toBe(false);
		});

		it('input rule wraps the paragraph in a blockquote container', async () => {
			const state = makeState([{ type: 'paragraph', text: '> ', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const rule = h.getInputRules()[0];

			const match = '> '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 2);

			expect(tr).not.toBeNull();
			const newState = state.apply(tr);
			// B2: the marker is consumed and the paragraph is wrapped into a
			// blockquote container (it is not re-typed into a flat blockquote).
			const top = newState.doc.children[0];
			assertDefined(top);
			expect(top.type).toBe('blockquote');
			expect(getBlockChildren(top).map((b) => b.type)).toEqual(['paragraph']);
		});

		it('input rule only applies on paragraph blocks', async () => {
			const state = makeState([{ type: 'blockquote', text: '> ', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const rule = h.getInputRules()[0];
			const match = '> '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 2);

			expect(tr).toBeNull();
		});
	});

	// Container-model keyboard navigation (B2, #136). The caret lives in a child
	// block of the blockquote; only the two container boundaries are handled here.
	const quoteState = (children: readonly BlockNode[], cursorChildId: string, offset: number) =>
		stateBuilder()
			.nestedBlock(createBlockNode('blockquote', children, blockId('bq1')))
			.cursor(cursorChildId, offset)
			.schema(['paragraph', 'blockquote'], ['bold'])
			.build();

	const para = (text: string, id: string): BlockNode =>
		createBlockNode('paragraph', [createTextNode(text)], blockId(id));

	const getEnter = (h: Awaited<ReturnType<typeof pluginHarness>>) =>
		h.getKeymaps().find((km) => km.Enter)?.Enter;
	const getBackspace = (h: Awaited<ReturnType<typeof pluginHarness>>) =>
		h.getKeymaps().find((km) => km.Backspace)?.Backspace;

	describe('keyboard: Enter exits the container', () => {
		it('Enter in an empty last child moves a new paragraph after the quote', async () => {
			const state = quoteState([para('quoted', 'p1'), para('', 'p2')], 'p2', 0);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getEnter(h);
			assertDefined(handler);
			expect(handler()).toBe(true);

			const top = h.getState().doc.children;
			expect(top.map((b) => b.type)).toEqual(['blockquote', 'paragraph']);
			// The quote keeps only its non-empty child.
			expect(getBlockChildren(top[0] as BlockNode).map((b) => getBlockText(b))).toEqual(['quoted']);
		});

		it('Enter in the sole empty child dissolves the quote into a paragraph', async () => {
			const state = quoteState([para('', 'p1')], 'p1', 0);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getEnter(h);
			assertDefined(handler);
			expect(handler()).toBe(true);
			expect(h.getState().doc.children.map((b) => b.type)).toEqual(['paragraph']);
		});

		it('returns false in a non-empty child (default split runs inside the quote)', async () => {
			const state = quoteState([para('quoted', 'p1')], 'p1', 6);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getEnter(h);
			assertDefined(handler);
			expect(handler()).toBe(false);
		});

		it('returns false in an empty non-last child', async () => {
			const state = quoteState([para('', 'p1'), para('tail', 'p2')], 'p1', 0);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getEnter(h);
			assertDefined(handler);
			expect(handler()).toBe(false);
		});

		it('returns false outside a blockquote', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getEnter(h);
			assertDefined(handler);
			expect(handler()).toBe(false);
		});

		it('returns false for a range selection', async () => {
			const state = stateBuilder()
				.nestedBlock(createBlockNode('blockquote', [para('quoted', 'p1')], blockId('bq1')))
				.selection({ blockId: 'p1', offset: 0 }, { blockId: 'p1', offset: 6 })
				.schema(['paragraph', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getEnter(h);
			assertDefined(handler);
			expect(handler()).toBe(false);
		});
	});

	describe('keyboard: Backspace lifts the first child', () => {
		it('Backspace at start of the first child lifts it before the quote', async () => {
			const state = quoteState([para('first', 'p1'), para('second', 'p2')], 'p1', 0);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getBackspace(h);
			assertDefined(handler);
			expect(handler()).toBe(true);

			const top = h.getState().doc.children;
			expect(top.map((b) => b.type)).toEqual(['paragraph', 'blockquote']);
			expect(getBlockText(top[0] as BlockNode)).toBe('first');
			expect(getBlockChildren(top[1] as BlockNode).map((b) => getBlockText(b))).toEqual(['second']);
		});

		it('Backspace at start of the sole child dissolves the quote', async () => {
			const state = quoteState([para('only', 'p1')], 'p1', 0);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getBackspace(h);
			assertDefined(handler);
			expect(handler()).toBe(true);

			const top = h.getState().doc.children;
			expect(top.map((b) => b.type)).toEqual(['paragraph']);
			expect(getBlockText(top[0] as BlockNode)).toBe('only');
		});

		it('returns false at offset 0 of a non-first child (default merge runs)', async () => {
			const state = quoteState([para('first', 'p1'), para('second', 'p2')], 'p2', 0);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getBackspace(h);
			assertDefined(handler);
			expect(handler()).toBe(false);
		});

		it('returns false when the cursor is not at offset 0', async () => {
			const state = quoteState([para('first', 'p1')], 'p1', 2);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getBackspace(h);
			assertDefined(handler);
			expect(handler()).toBe(false);
		});

		it('returns false outside a blockquote', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const handler = getBackspace(h);
			assertDefined(handler);
			expect(handler()).toBe(false);
		});
	});

	describe('toolbar item', () => {
		it('registers a blockquote toolbar item', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectToolbarItem(h, 'blockquote', {
				group: 'block',
				label: 'Blockquote',
				command: 'toggleBlockquote',
			});
		});

		// NOTE: the flat "isActive when cursor is in blockquote" test was removed —
		// under the B2 container model the anchor is a child block, not the
		// blockquote itself. The ancestor-based replacement lives in the
		// "issue #136" describe block ("isActive is true when the selection is
		// inside a blockquote container").

		it('isActive returns false when cursor is in paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			expectToolbarActive(h, 'blockquote', false);
		});
	});

	/**
	 * TDD specification for issue #136: blockquote becomes a CONTAINER block
	 * (state of the art, ProseMirror `wrapIn`/`lift` model). A blockquote may
	 * contain other blocks — paragraphs, headings, lists, nested blockquotes —
	 * mirroring HTML semantics (`<blockquote>` is flow content).
	 *
	 * These tests assert the TARGET behavior and therefore fail (red) against
	 * the current flat implementation. Implementing B2 makes them green:
	 *   - `blockquote` NodeSpec: content allows block children (see `table_cell`)
	 *   - `toggleBlockquote`: wrap the selected block range / lift it back out
	 *   - `toHTML`/`parseHTML`: serialize and parse nested block content
	 *
	 * Helper: builds a blockquote container node from child blocks.
	 */
	const quoteContainer = (children: readonly BlockNode[], id = 'bq1'): BlockNode =>
		createBlockNode('blockquote', children, blockId(id));

	describe('issue #136: blockquote is a container block (B2, state of the art)', () => {
		it('wraps a multi-block selection into a single blockquote container', async () => {
			const state = stateBuilder()
				.paragraph('one', 'p1')
				.paragraph('two', 'p2')
				.paragraph('three', 'p3')
				.selection({ blockId: 'p1', offset: 0 }, { blockId: 'p3', offset: 5 })
				.schema(['paragraph', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');

			const top = h.getState().doc.children;
			expect(top).toHaveLength(1);
			const quote = top[0];
			assertDefined(quote);
			expect(quote.type).toBe('blockquote');
			const inner = getBlockChildren(quote);
			expect(inner.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
			expect(inner.map((b) => getBlockText(b))).toEqual(['one', 'two', 'three']);
		});

		it('wraps a list without destroying it', async () => {
			const state = stateBuilder()
				.block('list_item', 'first', 'l1', { attrs: { listType: 'bullet', indent: 0 } })
				.block('list_item', 'second', 'l2', { attrs: { listType: 'bullet', indent: 0 } })
				.selection({ blockId: 'l1', offset: 0 }, { blockId: 'l2', offset: 6 })
				.schema(['paragraph', 'list_item', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');

			const quote = h.getState().doc.children[0];
			assertDefined(quote);
			expect(quote.type).toBe('blockquote');
			const inner = getBlockChildren(quote);
			expect(inner.map((b) => b.type)).toEqual(['list_item', 'list_item']);
			// List semantics survive the wrap.
			expect(inner[0]?.attrs).toEqual({ listType: 'bullet', indent: 0 });
			expect(inner[1]?.attrs).toEqual({ listType: 'bullet', indent: 0 });
		});

		it('wraps mixed heading, paragraph and list into one blockquote', async () => {
			const state = stateBuilder()
				.block('heading', 'Title', 'h1', { attrs: { level: 2 } })
				.paragraph('body', 'p1')
				.block('list_item', 'item', 'l1', { attrs: { listType: 'bullet', indent: 0 } })
				.selection({ blockId: 'h1', offset: 0 }, { blockId: 'l1', offset: 4 })
				.schema(['paragraph', 'heading', 'list_item', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');

			const top = h.getState().doc.children;
			expect(top).toHaveLength(1);
			const quote = top[0];
			assertDefined(quote);
			expect(quote.type).toBe('blockquote');
			expect(getBlockChildren(quote).map((b) => b.type)).toEqual([
				'heading',
				'paragraph',
				'list_item',
			]);
		});

		it('leaves a disallowed block (table) at the top level instead of nesting it', async () => {
			// A `table` is not in the blockquote's `content.allow`, so wrapping a
			// select-all range must not produce a schema-invalid quote-with-table.
			const state = stateBuilder()
				.paragraph('intro', 'p1')
				.block('table', '', 't1')
				.selection({ blockId: 'p1', offset: 0 }, { blockId: 't1', offset: 0 })
				.schema(['paragraph', 'table', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');

			const top = h.getState().doc.children;
			expect(top.map((b) => b.type)).toEqual(['blockquote', 'table']);
			const quote = top[0];
			assertDefined(quote);
			expect(getBlockChildren(quote).map((b) => b.type)).toEqual(['paragraph']);
		});

		it('splits the range around a disallowed block into separate quotes', async () => {
			const state = stateBuilder()
				.paragraph('before', 'p1')
				.block('table', '', 't1')
				.paragraph('after', 'p2')
				.selection({ blockId: 'p1', offset: 0 }, { blockId: 'p2', offset: 5 })
				.schema(['paragraph', 'table', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');

			const top = h.getState().doc.children;
			expect(top.map((b) => b.type)).toEqual(['blockquote', 'table', 'blockquote']);
			expect(getBlockText(getBlockChildren(top[0] as BlockNode)[0] as BlockNode)).toBe('before');
			expect(getBlockText(getBlockChildren(top[2] as BlockNode)[0] as BlockNode)).toBe('after');
		});

		it('wraps a single paragraph into a container (not a flat type swap)', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'p1')
				.cursor('p1', 0)
				.schema(['paragraph', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');

			const quote = h.getState().doc.children[0];
			assertDefined(quote);
			expect(quote.type).toBe('blockquote');
			const inner = getBlockChildren(quote);
			expect(inner).toHaveLength(1);
			const child = inner[0];
			assertDefined(child);
			expect(child.type).toBe('paragraph');
			expect(getBlockText(child)).toBe('Hello');
		});

		it('toggling off lifts the blocks back out of the blockquote', async () => {
			const inner1 = createBlockNode('paragraph', [createTextNode('one')], blockId('p1'));
			const inner2 = createBlockNode('paragraph', [createTextNode('two')], blockId('p2'));
			const state = stateBuilder()
				.nestedBlock(quoteContainer([inner1, inner2]))
				.cursor('p1', 0)
				.schema(['paragraph', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');

			const top = h.getState().doc.children;
			// Blocks are lifted back to the top level; the blockquote is gone.
			expect(top.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
			expect(top.map((b) => getBlockText(b))).toEqual(['one', 'two']);
		});

		it('isActive is true when the selection is inside a blockquote container', async () => {
			const inner = createBlockNode('paragraph', [createTextNode('quoted')], blockId('p1'));
			const state = stateBuilder()
				.nestedBlock(quoteContainer([inner]))
				.cursor('p1', 0)
				.schema(['paragraph', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), state);

			const item = h.getToolbarItem('blockquote');
			assertDefined(item);
			// Ancestor-based: the anchor block is a paragraph, but it lives inside
			// a blockquote, so the toolbar item must report active.
			expect(item.isActive?.(state)).toBe(true);
		});

		it('wrapping a multi-block selection is reversible via undo', async () => {
			const before = stateBuilder()
				.paragraph('one', 'p1')
				.paragraph('two', 'p2')
				.selection({ blockId: 'p1', offset: 0 }, { blockId: 'p2', offset: 3 })
				.schema(['paragraph', 'blockquote'], ['bold'])
				.build();
			const h = await pluginHarness(new BlockquotePlugin(), before);

			h.executeCommand('toggleBlockquote');

			// Sanity: the wrap produced a single container holding both blocks
			// (red against the flat impl, which only re-types the anchor block).
			const after = h.getState();
			expect(after.doc.children).toHaveLength(1);
			const quote = after.doc.children[0];
			assertDefined(quote);
			expect(quote.type).toBe('blockquote');
			expect(getBlockChildren(quote)).toHaveLength(2);

			// Structural undo must restore the original flat document exactly.
			const tr = h.dispatch.mock.calls.at(-1)?.[0];
			assertDefined(tr);
			const restored = after.apply(invertTransaction(tr));
			expect(restored.doc).toEqual(before.doc);
		});

		it('round-trips a quoted list through HTML without flattening it', async () => {
			const h = await pluginHarness([new BlockquotePlugin(), new ListPlugin()], undefined, {
				builtinSpecs: true,
			});
			const registry = h.pm.schemaRegistry;
			const html = '<blockquote><ul><li>quoted item</li></ul></blockquote>';

			const doc1 = parseHTMLToDocument(html, registry);
			const html1 = serializeDocumentToHTML(doc1, registry);

			// The list must survive nested inside the blockquote.
			expect(html1).toMatch(/<blockquote[ >]/);
			expect(html1).toMatch(/<li[ >]/);
			// Serialization is stable on a second round-trip.
			const html2 = serializeDocumentToHTML(parseHTMLToDocument(html1, registry), registry);
			expect(html2).toBe(html1);
		});

		it('round-trips a nested blockquote (quote-in-quote) stably', async () => {
			const h = await pluginHarness([new BlockquotePlugin(), new ListPlugin()], undefined, {
				builtinSpecs: true,
			});
			const registry = h.pm.schemaRegistry;
			const html = '<blockquote><blockquote><p>deep</p></blockquote></blockquote>';

			const html1 = serializeDocumentToHTML(parseHTMLToDocument(html, registry), registry);
			// The nested-quote structure survives and the inner text is preserved.
			expect((html1.match(/<blockquote/g) ?? []).length).toBe(2);
			expect(html1).toContain('deep');
			// Stable on a second round-trip (no progressive flattening or growth).
			const html2 = serializeDocumentToHTML(parseHTMLToDocument(html1, registry), registry);
			expect(html2).toBe(html1);
		});
	});

	/**
	 * Undo/redo stress for the structural wrap (issue #136, Schritt 9). The 9
	 * acceptance tests above only assert single-transaction inversion, which the
	 * composition approach (N×removeNode + insertNode) passes trivially. These
	 * tests exercise the genuinely rebase-prone paths the recent structural-undo
	 * fixes (#129/#134) targeted: a structural wrap followed by content edits, and
	 * a wrap undone *through an intervening out-of-band edit*. They are the
	 * regression that decides whether composition is sufficient or a dedicated
	 * WrapStep/LiftStep is required.
	 */
	describe('issue #136: structural undo/redo stress', () => {
		const twoParagraphs = (): EditorState =>
			EditorState.create({
				doc: createDocument([
					createBlockNode(nodeType('paragraph'), [createTextNode('one')], blockId('p1')),
					createBlockNode(nodeType('paragraph'), [createTextNode('two')], blockId('p2')),
				]),
				selection: createSelection(
					{ blockId: blockId('p1'), offset: 0 },
					{ blockId: blockId('p2'), offset: 3 },
				),
			});

		it('wrap → type inside quote → undo → undo → redo → redo round-trips exactly', () => {
			let state = twoParagraphs();
			const before = state.doc;
			const history = new HistoryManager();

			const wrapTr = wrapSelectionInContainer(
				state,
				nodeType('blockquote'),
				state.selection as Selection,
			);
			assertDefined(wrapTr);
			state = state.apply(wrapTr);
			history.push(wrapTr);

			// Type inside the now-nested first paragraph.
			const typeTr = state.transaction('input').insertText(blockId('p1'), 3, 'X', []).build();
			state = state.apply(typeTr);
			history.push(typeTr);

			expect(state.doc.children[0]?.type).toBe('blockquote');
			expect(getBlockText(getBlockChildren(state.doc.children[0] as BlockNode)[0])).toBe('oneX');

			// Undo typing.
			const u1 = history.undo(state);
			assertDefined(u1);
			state = u1.state;
			expect(getBlockText(getBlockChildren(state.doc.children[0] as BlockNode)[0])).toBe('one');

			// Undo wrap → flat document restored exactly.
			const u2 = history.undo(state);
			assertDefined(u2);
			state = u2.state;
			expect(state.doc).toEqual(before);

			// Redo wrap, then redo typing.
			const r1 = history.redo(state);
			assertDefined(r1);
			state = r1.state;
			expect(state.doc.children[0]?.type).toBe('blockquote');

			const r2 = history.redo(state);
			assertDefined(r2);
			state = r2.state;
			expect(getBlockText(getBlockChildren(state.doc.children[0] as BlockNode)[0])).toBe('oneX');
		});

		it('undo of a wrap rebases through an intervening top-level insert (#134 class)', () => {
			let state = twoParagraphs();
			const history = new HistoryManager();

			// Wrap p1+p2 (top-level indices 0..1) into a blockquote.
			const wrapTr = wrapSelectionInContainer(
				state,
				nodeType('blockquote'),
				state.selection as Selection,
			);
			assertDefined(wrapTr);
			state = state.apply(wrapTr);
			history.push(wrapTr);

			// Out-of-band edit: insert a new top-level paragraph BEFORE the quote.
			// This shifts the blockquote from index 0 to index 1, so the wrap's
			// inverse must rebase its sibling indices.
			const interTr = state
				.transaction('api')
				.insertNode(
					[],
					0,
					createBlockNode(nodeType('paragraph'), [createTextNode('x')], blockId('x0')),
				)
				.build();
			state = state.apply(interTr);
			history.recordIntervening(interTr.mapping);

			// Undo the wrap: dissolve the quote now at index 1, lift p1/p2 back out,
			// leaving the intervening paragraph untouched.
			const undone = history.undo(state);
			assertDefined(undone);
			state = undone.state;

			expect(state.doc.children.map((b) => b.type)).toEqual([
				'paragraph',
				'paragraph',
				'paragraph',
			]);
			expect(state.doc.children.map((b) => getBlockText(b))).toEqual(['x', 'one', 'two']);
		});
	});

	// Container caret navigation (B2, #136): Enter-exit and Backspace-lift are
	// covered by the unit tests above. ArrowUp/ArrowDown crossing the container
	// boundary relies on native caret movement (no custom handler), which cannot
	// be exercised in happy-dom — it is covered by the e2e suite instead.
});
