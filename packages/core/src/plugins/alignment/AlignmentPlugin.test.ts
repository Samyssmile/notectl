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
import { ImagePlugin } from '../image/ImagePlugin.js';
import { createTable } from '../table/TableHelpers.js';
import { TablePlugin } from '../table/TablePlugin.js';
import { AlignmentPlugin } from './AlignmentPlugin.js';

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

describe('AlignmentPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new AlignmentPlugin();
			expect(plugin.id).toBe('alignment');
			expect(plugin.name).toBe('Alignment');
			expect(plugin.priority).toBe(90);
		});
	});

	describe('NodeSpec patching', () => {
		it('patches paragraph NodeSpec with align attr', async () => {
			const h = await pluginHarness(new AlignmentPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');
			expect(spec?.attrs?.align).toBeDefined();
			expect(spec?.attrs?.align?.default).toBe('left');
		});

		it('patches heading NodeSpec with align attr when heading plugin is loaded', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('heading');
			expect(spec?.attrs?.align).toBeDefined();
			expect(spec?.attrs?.align?.default).toBe('left');
		});

		it('does not patch image NodeSpec (already has align attr)', async () => {
			const h = await pluginHarness(
				[new ImagePlugin(), new AlignmentPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			// Image NodeSpec should keep its own align attr with default 'center'
			const spec = h.getNodeSpec('image');
			expect(spec?.attrs?.align).toBeDefined();
			expect(spec?.attrs?.align?.default).toBe('center');
		});

		it('paragraph toDOM renders text-align style for non-left alignment', async () => {
			const h = await pluginHarness(new AlignmentPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', {
					align: 'center',
				}),
			);
			expect(el?.style.textAlign).toBe('center');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('paragraph toDOM does not set style for left alignment', async () => {
			const h = await pluginHarness(new AlignmentPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', {
					align: 'left',
				}),
			);
			expect(el?.style.textAlign).toBe('');
		});

		it('heading toDOM renders text-align style and correct tag', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('heading');

			const el = spec?.toDOM(
				createBlockNode('heading', [createTextNode('')], 'test', {
					level: 2,
					align: 'right',
				}),
			);
			expect(el?.tagName).toBe('H2');
			expect(el?.style.textAlign).toBe('right');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('heading toDOM preserves original behavior without alignment', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
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
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);

			expectCommandRegistered(h, 'alignLeft');
			expectCommandRegistered(h, 'alignCenter');
			expectCommandRegistered(h, 'alignRight');
			expectCommandRegistered(h, 'alignJustify');
		});

		it('alignCenter sets align to center on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('alignCenter');
			expect(h.getState().doc.children[0]?.attrs?.align).toBe('center');
		});

		it('alignRight sets align to right on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('alignRight');
			expect(h.getState().doc.children[0]?.attrs?.align).toBe('right');
		});

		it('alignJustify sets align to justify on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('alignJustify');
			expect(h.getState().doc.children[0]?.attrs?.align).toBe('justify');
		});

		it('alignLeft resets align to left', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { align: 'center' },
				},
			]);
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('alignLeft');
			expect(h.getState().doc.children[0]?.attrs?.align).toBe('left');
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
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.align).toBe('center');
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
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignRight');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.level).toBe(3);
			expect(block?.attrs?.align).toBe('right');
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
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);

			expect(h.executeCommand('alignCenter')).toBe(false);
		});

		it('respects configured alignments subset', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(
				new AlignmentPlugin({ alignments: ['left', 'center'] }),
				state,
				HARNESS_OPTIONS,
			);

			expectCommandRegistered(h, 'alignLeft');
			expectCommandRegistered(h, 'alignCenter');
			expect(h.executeCommand('alignRight')).toBe(false);
			expect(h.executeCommand('alignJustify')).toBe(false);
		});
	});

	describe('NodeSelection support', () => {
		it('sets alignment on image via NodeSelection', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', { attrs: { src: 'test.png', alt: '', align: 'center' } })
				.nodeSelection('img1')
				.schema(['paragraph', 'image'], ['bold'])
				.build();
			const h = await pluginHarness(
				[new ImagePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignLeft');
			const block = h.getState().doc.children[1];
			expect(block?.attrs?.align).toBe('left');
		});

		it('sets alignment to right on image via NodeSelection', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', { attrs: { src: 'test.png', alt: '', align: 'center' } })
				.nodeSelection('img1')
				.schema(['paragraph', 'image'], ['bold'])
				.build();
			const h = await pluginHarness(
				[new ImagePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignRight');
			const block = h.getState().doc.children[1];
			expect(block?.attrs?.align).toBe('right');
		});

		it('isEnabled returns true for image NodeSelection', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', { attrs: { src: 'test.png', alt: '', align: 'center' } })
				.nodeSelection('img1')
				.schema(['paragraph', 'image'], ['bold'])
				.build();
			const h = await pluginHarness(
				[new ImagePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarEnabled(h, 'alignment', true);
		});

		it('isActive returns false when image has default center alignment', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', { attrs: { src: 'test.png', alt: '', align: 'center' } })
				.nodeSelection('img1')
				.schema(['paragraph', 'image'], ['bold'])
				.build();
			const h = await pluginHarness(
				[new ImagePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarActive(h, 'alignment', false);
		});

		it('isActive returns true when image has non-default alignment', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', { attrs: { src: 'test.png', alt: '', align: 'left' } })
				.nodeSelection('img1')
				.schema(['paragraph', 'image'], ['bold'])
				.build();
			const h = await pluginHarness(
				[new ImagePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarActive(h, 'alignment', true);
		});
	});

	describe('keymap registration', () => {
		it('registers keymaps for all alignments', async () => {
			const h = await pluginHarness(new AlignmentPlugin(), undefined, HARNESS_OPTIONS);
			const keymaps = h.getKeymaps();

			const keys = keymaps.flatMap((km) => Object.keys(km));
			expect(keys).toContain('Mod-Shift-L');
			expect(keys).toContain('Mod-Shift-E');
			expect(keys).toContain('Mod-Shift-R');
			expect(keys).toContain('Mod-Shift-J');
		});

		it('restricts keymaps to configured alignments', async () => {
			const h = await pluginHarness(
				new AlignmentPlugin({ alignments: ['left', 'center'] }),
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
		it('registers an alignment toolbar item', async () => {
			const h = await pluginHarness(new AlignmentPlugin(), undefined, HARNESS_OPTIONS);
			expectToolbarItem(h, 'alignment', {
				group: 'block',
				popupType: 'dropdown',
			});
		});

		it('dropdown contains all configured alignments', async () => {
			const h = await pluginHarness(
				new AlignmentPlugin({
					alignments: ['left', 'center', 'right'],
				}),
				undefined,
				HARNESS_OPTIONS,
			);
			const item = h.getToolbarItem('alignment');
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
					attrs: { align: 'center' },
				},
			]);
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);
			expectToolbarActive(h, 'alignment', true);
		});

		it('isActive returns false when block has left alignment', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { align: 'left' },
				},
			]);
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);
			expectToolbarActive(h, 'alignment', false);
		});

		it('isEnabled returns true for alignable blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);
			expectToolbarEnabled(h, 'alignment', true);
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
			const h = await pluginHarness(new AlignmentPlugin(), state, HARNESS_OPTIONS);
			expectToolbarEnabled(h, 'alignment', false);
		});

		it('isEnabled returns true for title blocks', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarEnabled(h, 'alignment', true);
		});

		it('isEnabled returns true for subtitle blocks', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarEnabled(h, 'alignment', true);
		});
	});

	describe('title and subtitle alignment', () => {
		it('sets alignment on title blocks', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.align).toBe('center');
		});

		it('sets alignment on subtitle blocks', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.align).toBe('center');
		});

		it('preserves align when changing paragraph to title', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { align: 'center' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setTitle');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('title');
			expect(block?.attrs?.align).toBe('center');
		});

		it('preserves align when changing paragraph to subtitle', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { align: 'right' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setSubtitle');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('subtitle');
			expect(block?.attrs?.align).toBe('right');
		});
	});

	describe('middleware — preserves alignment on block type change', () => {
		it('preserves align when changing paragraph to heading', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { align: 'center' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setHeading1');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.align).toBe('center');
		});

		it('preserves align when changing heading to paragraph', async () => {
			const state = makeState([
				{
					type: 'heading',
					text: 'Title',
					id: 'b1',
					attrs: { level: 1, align: 'right' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setParagraph');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('paragraph');
			expect(block?.attrs?.align).toBe('right');
		});

		it('does not interfere when block has left alignment', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { align: 'left' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setHeading2');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(2);
		});

		it('does not interfere when block has no align attr', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new AlignmentPlugin()],
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
			const firstParagraph = getBlockChildren(firstCell)[0] as ReturnType<typeof createTable>;

			return {
				cellId: firstCell.id,
				paragraphId: firstParagraph.id,
				state: stateBuilder()
					.nestedBlock(table)
					.cursor(firstParagraph.id, 0)
					.schema(
						['paragraph', 'table', 'table_row', 'table_cell'],
						['bold', 'italic', 'underline'],
					)
					.build(),
			};
		}

		it('patches table_cell NodeSpec with align attr', async () => {
			const { state } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('table_cell');
			expect(spec?.attrs?.align).toBeDefined();
			expect(spec?.attrs?.align?.default).toBe('left');
		});

		it('alignCenter sets align to center on paragraph inside table cell', async () => {
			const { state, paragraphId } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			const para = h.getState().getBlock(paragraphId);
			expect(para?.attrs?.align).toBe('center');
		});

		it('alignRight sets align to right on paragraph inside table cell', async () => {
			const { state, paragraphId } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignRight');
			const para = h.getState().getBlock(paragraphId);
			expect(para?.attrs?.align).toBe('right');
		});

		it('alignJustify sets align to justify on paragraph inside table cell', async () => {
			const { state, paragraphId } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignJustify');
			const para = h.getState().getBlock(paragraphId);
			expect(para?.attrs?.align).toBe('justify');
		});

		it('alignLeft resets align to left on paragraph inside table cell', async () => {
			const { state, paragraphId } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			h.executeCommand('alignLeft');
			const para = h.getState().getBlock(paragraphId);
			expect(para?.attrs?.align).toBe('left');
		});

		it('isEnabled returns true when cursor is in a table cell', async () => {
			const { state } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarEnabled(h, 'alignment', true);
		});

		it('isActive returns true when paragraph in table cell has non-left alignment', async () => {
			const { state } = makeTableCellState();
			const h = await pluginHarness(
				[new TablePlugin(), new AlignmentPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('alignCenter');
			expectToolbarActive(h, 'alignment', true);
		});
	});
});
