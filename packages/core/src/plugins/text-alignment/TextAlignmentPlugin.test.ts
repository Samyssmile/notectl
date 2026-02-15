import { describe, expect, it } from 'vitest';
import { createBlockNode, createTextNode, getBlockChildren } from '../../model/Document.js';
import {
	expectCommandRegistered,
	expectToolbarActive,
	expectToolbarEnabled,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { HeadingPlugin } from '../heading/HeadingPlugin.js';
import { createTable } from '../table/TableHelpers.js';
import { TablePlugin } from '../table/TablePlugin.js';
import { TextAlignmentPlugin } from './TextAlignmentPlugin.js';

// --- Helpers ---

const HARNESS_OPTIONS = { useMiddleware: true, builtinSpecs: true } as const;

function makeState(
	blocks?: {
		type: string;
		text: string;
		id: string;
		attrs?: Record<string, string | number | boolean>;
	}[],
	cursorBlockId?: string,
	cursorOffset?: number,
) {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id, { attrs: b.attrs });
	}
	const bid = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline']);
	return builder.build();
}

// --- Tests ---

describe('TextAlignmentPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new TextAlignmentPlugin();
			expect(plugin.id).toBe('text-alignment');
			expect(plugin.name).toBe('Text Alignment');
			expect(plugin.priority).toBe(90);
		});
	});

	describe('NodeSpec patching', () => {
		it('patches paragraph NodeSpec with textAlign attr', async () => {
			const h = await pluginHarness(new TextAlignmentPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');
			expect(spec?.attrs?.textAlign).toBeDefined();
			expect(spec?.attrs?.textAlign?.default).toBe('left');
		});

		it('patches heading NodeSpec with textAlign attr when heading plugin is loaded', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('heading');
			expect(spec?.attrs?.textAlign).toBeDefined();
			expect(spec?.attrs?.textAlign?.default).toBe('left');
		});

		it('paragraph toDOM renders text-align style for non-left alignment', async () => {
			const h = await pluginHarness(new TextAlignmentPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', {
					textAlign: 'center',
				}),
			);
			expect(el?.style.textAlign).toBe('center');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('paragraph toDOM does not set style for left alignment', async () => {
			const h = await pluginHarness(new TextAlignmentPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', {
					textAlign: 'left',
				}),
			);
			expect(el?.style.textAlign).toBe('');
		});

		it('heading toDOM renders text-align style and correct tag', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('heading');

			const el = spec?.toDOM(
				createBlockNode('heading', [createTextNode('')], 'test', {
					level: 2,
					textAlign: 'right',
				}),
			);
			expect(el?.tagName).toBe('H2');
			expect(el?.style.textAlign).toBe('right');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('heading toDOM preserves original behavior without alignment', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('heading');

			const el = spec?.toDOM(
				createBlockNode('heading', [createTextNode('')], 'test', {
					level: 3,
				}),
			);
			expect(el?.tagName).toBe('H3');
			expect(el?.style.textAlign).toBe('');
		});
	});

	describe('commands', () => {
		it('registers alignment commands for all four alignments', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);

			expectCommandRegistered(h, 'alignLeft');
			expectCommandRegistered(h, 'alignCenter');
			expectCommandRegistered(h, 'alignRight');
			expectCommandRegistered(h, 'alignJustify');
		});

		it('alignCenter sets textAlign to center on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('alignCenter');
			expect(h.getState().doc.children[0]?.attrs?.textAlign).toBe('center');
		});

		it('alignRight sets textAlign to right on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('alignRight');
			expect(h.getState().doc.children[0]?.attrs?.textAlign).toBe('right');
		});

		it('alignJustify sets textAlign to justify on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('alignJustify');
			expect(h.getState().doc.children[0]?.attrs?.textAlign).toBe('justify');
		});

		it('alignLeft resets textAlign to left', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { textAlign: 'center' },
				},
			]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('alignLeft');
			expect(h.getState().doc.children[0]?.attrs?.textAlign).toBe('left');
		});

		it('sets alignment on heading blocks', async () => {
			const state = makeState([
				{
					type: 'heading',
					text: 'Title',
					id: 'b1',
					attrs: { level: 1 },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('preserves heading level when setting alignment', async () => {
			const state = makeState([
				{
					type: 'heading',
					text: 'Title',
					id: 'b1',
					attrs: { level: 3 },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignRight');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.level).toBe(3);
			expect(block?.attrs?.textAlign).toBe('right');
		});

		it('returns false for non-alignable block types', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'Item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);

			expect(h.executeCommand('alignCenter')).toBe(false);
		});

		it('respects configured alignments subset', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(
				new TextAlignmentPlugin({ alignments: ['left', 'center'] }),
				state,
				HARNESS_OPTIONS,
			);

			expectCommandRegistered(h, 'alignLeft');
			expectCommandRegistered(h, 'alignCenter');
			expect(h.executeCommand('alignRight')).toBe(false);
			expect(h.executeCommand('alignJustify')).toBe(false);
		});
	});

	describe('keymap registration', () => {
		it('registers keymaps for all alignments', async () => {
			const h = await pluginHarness(new TextAlignmentPlugin(), undefined, HARNESS_OPTIONS);
			const keymaps = h.getKeymaps();

			const keys = keymaps.flatMap((km) => Object.keys(km));
			expect(keys).toContain('Mod-Shift-L');
			expect(keys).toContain('Mod-Shift-E');
			expect(keys).toContain('Mod-Shift-R');
			expect(keys).toContain('Mod-Shift-J');
		});

		it('restricts keymaps to configured alignments', async () => {
			const h = await pluginHarness(
				new TextAlignmentPlugin({ alignments: ['left', 'center'] }),
				undefined,
				HARNESS_OPTIONS,
			);
			const keymaps = h.getKeymaps();

			const keys = keymaps.flatMap((km) => Object.keys(km));
			expect(keys).toContain('Mod-Shift-L');
			expect(keys).toContain('Mod-Shift-E');
			expect(keys).not.toContain('Mod-Shift-R');
			expect(keys).not.toContain('Mod-Shift-J');
		});
	});

	describe('toolbar item', () => {
		it('registers a text-alignment toolbar item', async () => {
			const h = await pluginHarness(new TextAlignmentPlugin(), undefined, HARNESS_OPTIONS);
			expectToolbarItem(h, 'text-alignment', {
				group: 'block',
				popupType: 'dropdown',
			});
		});

		it('dropdown contains all configured alignments', async () => {
			const h = await pluginHarness(
				new TextAlignmentPlugin({
					alignments: ['left', 'center', 'right'],
				}),
				undefined,
				HARNESS_OPTIONS,
			);
			const item = h.getToolbarItem('text-alignment');
			const config = item?.popupConfig as {
				items: readonly { label: string }[];
			};

			expect(config.items).toHaveLength(3);
			expect(config.items[0]?.label).toBe('Align Left');
			expect(config.items[1]?.label).toBe('Align Center');
			expect(config.items[2]?.label).toBe('Align Right');
		});

		it('isActive returns true when block has non-left alignment', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { textAlign: 'center' },
				},
			]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);
			expectToolbarActive(h, 'text-alignment', true);
		});

		it('isActive returns false when block has left alignment', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { textAlign: 'left' },
				},
			]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);
			expectToolbarActive(h, 'text-alignment', false);
		});

		it('isEnabled returns true for alignable blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);
			expectToolbarEnabled(h, 'text-alignment', true);
		});

		it('isEnabled returns false for non-alignable blocks', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'Item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const h = await pluginHarness(new TextAlignmentPlugin(), state, HARNESS_OPTIONS);
			expectToolbarEnabled(h, 'text-alignment', false);
		});

		it('isEnabled returns true for title blocks', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarEnabled(h, 'text-alignment', true);
		});

		it('isEnabled returns true for subtitle blocks', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarEnabled(h, 'text-alignment', true);
		});
	});

	describe('title and subtitle alignment', () => {
		it('sets alignment on title blocks', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('sets alignment on subtitle blocks', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('preserves textAlign when changing paragraph to title', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { textAlign: 'center' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setTitle');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('title');
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('preserves textAlign when changing paragraph to subtitle', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { textAlign: 'right' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setSubtitle');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('subtitle');
			expect(block?.attrs?.textAlign).toBe('right');
		});
	});

	describe('middleware — preserves alignment on block type change', () => {
		it('preserves textAlign when changing paragraph to heading', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { textAlign: 'center' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setHeading1');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('preserves textAlign when changing heading to paragraph', async () => {
			const state = makeState([
				{
					type: 'heading',
					text: 'Title',
					id: 'b1',
					attrs: { level: 1, textAlign: 'right' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setParagraph');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('paragraph');
			expect(block?.attrs?.textAlign).toBe('right');
		});

		it('does not interfere when block has left alignment', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { textAlign: 'left' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setHeading2');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(2);
		});

		it('does not interfere when block has no textAlign attr', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setHeading1');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(1);
		});
	});

	describe('table cell alignment', () => {
		function makeTableCellState() {
			const table = createTable(2, 2);
			const firstRow = getBlockChildren(table)[0] as ReturnType<typeof createTable>;
			const firstCell = getBlockChildren(firstRow)[0] as ReturnType<typeof createTable>;

			return {
				cellId: firstCell.id,
				state: stateBuilder()
					.nestedBlock(table)
					.cursor(firstCell.id, 0)
					.schema(
						['paragraph', 'table', 'table_row', 'table_cell'],
						['bold', 'italic', 'underline'],
					)
					.build(),
			};
		}

		it('patches table_cell NodeSpec with textAlign attr', async () => {
			const { state } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('table_cell');
			expect(spec?.attrs?.textAlign).toBeDefined();
			expect(spec?.attrs?.textAlign?.default).toBe('left');
		});

		it('alignCenter sets textAlign to center on table cell', async () => {
			const { state, cellId } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			const cell = h.getState().getBlock(cellId);
			expect(cell?.attrs?.textAlign).toBe('center');
		});

		it('alignRight sets textAlign to right on table cell', async () => {
			const { state, cellId } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignRight');
			const cell = h.getState().getBlock(cellId);
			expect(cell?.attrs?.textAlign).toBe('right');
		});

		it('alignJustify sets textAlign to justify on table cell', async () => {
			const { state, cellId } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignJustify');
			const cell = h.getState().getBlock(cellId);
			expect(cell?.attrs?.textAlign).toBe('justify');
		});

		it('alignLeft resets textAlign to left on table cell', async () => {
			const { state, cellId } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			h.executeCommand('alignLeft');
			const cell = h.getState().getBlock(cellId);
			expect(cell?.attrs?.textAlign).toBe('left');
		});

		it('isEnabled returns true when cursor is in a table cell', async () => {
			const { state } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarEnabled(h, 'text-alignment', true);
		});

		it('isActive returns true when table cell has non-left alignment', async () => {
			const { state } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new TextAlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			expectToolbarActive(h, 'text-alignment', true);
		});
	});
});
