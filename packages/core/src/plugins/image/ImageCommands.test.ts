import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import { createCollapsedSelection, isNodeSelection } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { createTable } from '../table/TableHelpers.js';
import { TablePlugin } from '../table/TablePlugin.js';
import { ImagePlugin } from './ImagePlugin.js';

// --- Helpers ---

const IMAGE_SCHEMA_NODES: string[] = ['paragraph', 'image'];
const IMAGE_SCHEMA_MARKS: string[] = ['bold', 'italic'];
const TABLE_IMAGE_SCHEMA_NODES: string[] = [
	'paragraph',
	'image',
	'table',
	'table_row',
	'table_cell',
];

function defaultState() {
	return stateBuilder()
		.paragraph('', 'b1')
		.cursor('b1', 0)
		.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
		.build();
}

/** Creates a state with a table and cursor in a specific cell. */
function makeTableStateWithImage(cursorRow = 0, cursorCol = 0): EditorState {
	const table: BlockNode = createTable(2, 2);
	const para: BlockNode = createBlockNode(
		nodeType('paragraph') as NodeTypeName,
		[createTextNode('')],
		'para-after' as BlockId,
	);

	const doc = { children: [table, para] };

	const tableRows: readonly BlockNode[] = getBlockChildren(table);
	const row: BlockNode | undefined = tableRows[cursorRow];
	if (!row) throw new Error('Row not found');
	const cells: readonly BlockNode[] = getBlockChildren(row);
	const cell: BlockNode | undefined = cells[cursorCol];
	if (!cell) throw new Error('Cell not found');

	return EditorState.create({
		doc,
		selection: createCollapsedSelection(cell.id, 0),
		schema: {
			nodeTypes: TABLE_IMAGE_SCHEMA_NODES,
			markTypes: IMAGE_SCHEMA_MARKS,
		},
	});
}

// --- Tests ---

describe('ImageCommands', () => {
	describe('insertImage', () => {
		it('inserts image block after current block', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, dispatch, getState } = await pluginHarness(plugin, state);

			pm.executeCommand('insertImage');

			expect(dispatch).toHaveBeenCalled();
			const doc = getState().doc;
			expect(doc.children).toHaveLength(3);
			expect(doc.children[0]?.type).toBe('paragraph');
			expect(doc.children[1]?.type).toBe('image');
			expect(doc.children[2]?.type).toBe('paragraph');
		});

		it('creates trailing paragraph for continued editing', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, getState } = await pluginHarness(plugin, state);

			pm.executeCommand('insertImage');

			const doc = getState().doc;
			expect(doc.children[2]?.type).toBe('paragraph');
		});

		it('sets NodeSelection on the new image block', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, getState } = await pluginHarness(plugin, state);

			pm.executeCommand('insertImage');

			const sel = getState().selection;
			expect(isNodeSelection(sel)).toBe(true);
			if (isNodeSelection(sel)) {
				expect(sel.nodeId).toBe(getState().doc.children[1]?.id);
			}
		});

		it('inserts image into table cell when cursor is in cell', async () => {
			const state = makeTableStateWithImage(0, 0);
			const plugins = [new ImagePlugin(), new TablePlugin()];
			const { pm, dispatch, getState } = await pluginHarness(plugins, state);

			pm.executeCommand('insertImage');

			expect(dispatch).toHaveBeenCalled();
			const newState = getState();

			// Table still exists at root
			expect(newState.doc.children[0]?.type).toBe('table');

			// Find the cell — first row, first column
			const table: BlockNode = newState.doc.children[0] as BlockNode;
			const rows: readonly BlockNode[] = getBlockChildren(table);
			const row: BlockNode = rows[0] as BlockNode;
			const cells: readonly BlockNode[] = getBlockChildren(row);
			const cell: BlockNode = cells[0] as BlockNode;

			// Cell now has an image block child
			const cellBlockChildren: readonly BlockNode[] = getBlockChildren(cell);
			expect(cellBlockChildren).toHaveLength(1);
			expect(cellBlockChildren[0]?.type).toBe('image');
		});

		it('sets NodeSelection on image in table cell', async () => {
			const state = makeTableStateWithImage(0, 0);
			const plugins = [new ImagePlugin(), new TablePlugin()];
			const { pm, getState } = await pluginHarness(plugins, state);

			pm.executeCommand('insertImage');

			const sel = getState().selection;
			expect(isNodeSelection(sel)).toBe(true);
			if (isNodeSelection(sel)) {
				// The selected node should be the image
				const imgBlock = getState().getBlock(sel.nodeId);
				expect(imgBlock?.type).toBe('image');
			}
		});
	});

	describe('removeImage', () => {
		it('removes selected image block', async () => {
			const state = stateBuilder()
				.paragraph('Before', 'b1')
				.block('image', '', 'img1', { attrs: { src: 'test.png', alt: '', align: 'center' } })
				.paragraph('After', 'b2')
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, dispatch, getState } = await pluginHarness(plugin, state);

			const result = pm.executeCommand('removeImage');

			expect(result).toBe(true);
			expect(dispatch).toHaveBeenCalled();
			expect(getState().doc.children).toHaveLength(2);
			expect(getState().doc.children.every((b) => b.type !== 'image')).toBe(true);
		});

		it('returns false when no NodeSelection', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, state);

			const result = pm.executeCommand('removeImage');
			expect(result).toBe(false);
		});

		it('returns false when NodeSelection is not on image', async () => {
			const state = stateBuilder()
				.paragraph('Before', 'b1')
				.paragraph('After', 'b2')
				.nodeSelection('b1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, state);

			const result = pm.executeCommand('removeImage');
			expect(result).toBe(false);
		});

		it('removes image from table cell', async () => {
			const state = makeTableStateWithImage(0, 0);
			const plugins = [new ImagePlugin(), new TablePlugin()];
			const { pm, dispatch, getState } = await pluginHarness(plugins, state);

			// First insert an image into the cell
			pm.executeCommand('insertImage');
			expect(dispatch).toHaveBeenCalled();

			// Verify image was inserted
			const sel = getState().selection;
			expect(isNodeSelection(sel)).toBe(true);

			// Now remove it
			const result = pm.executeCommand('removeImage');
			expect(result).toBe(true);

			// Cell should no longer have image block children
			const table: BlockNode = getState().doc.children[0] as BlockNode;
			const rows: readonly BlockNode[] = getBlockChildren(table);
			const row: BlockNode = rows[0] as BlockNode;
			const cells: readonly BlockNode[] = getBlockChildren(row);
			const cell: BlockNode = cells[0] as BlockNode;
			const cellBlockChildren: readonly BlockNode[] = getBlockChildren(cell);
			expect(cellBlockChildren).toHaveLength(0);
		});
	});

	describe('resizeImageByDelta', () => {
		it('grows image width while preserving aspect ratio', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center', width: 200, height: 100 },
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, getState } = await pluginHarness(plugin, state);

			const result = pm.executeCommand('resizeImageGrow');
			expect(result).toBe(true);

			const block = getState().getBlock('img1' as BlockId);
			expect(block?.attrs?.width).toBe(210);
			expect(block?.attrs?.height).toBe(105);
		});

		it('shrinks image width while preserving aspect ratio', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center', width: 200, height: 100 },
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, getState } = await pluginHarness(plugin, state);

			const result = pm.executeCommand('resizeImageShrink');
			expect(result).toBe(true);

			const block = getState().getBlock('img1' as BlockId);
			expect(block?.attrs?.width).toBe(190);
			expect(block?.attrs?.height).toBe(95);
		});

		it('clamps to MIN_IMAGE_WIDTH', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center', width: 55, height: 55 },
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, getState } = await pluginHarness(plugin, state);

			const result = pm.executeCommand('resizeImageShrink');
			expect(result).toBe(true);

			const block = getState().getBlock('img1' as BlockId);
			expect(block?.attrs?.width).toBeGreaterThanOrEqual(50);
		});

		it('clamps to maxWidth', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center', width: 795, height: 795 },
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, getState } = await pluginHarness(plugin, state);

			const result = pm.executeCommand('resizeImageGrow');
			expect(result).toBe(true);

			const block = getState().getBlock('img1' as BlockId);
			expect(block?.attrs?.width).toBeLessThanOrEqual(800);
		});

		it('returns false when no NodeSelection', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, state);

			expect(pm.executeCommand('resizeImageGrow')).toBe(false);
		});

		it('returns false when image has no width/height', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center' },
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, state);

			expect(pm.executeCommand('resizeImageGrow')).toBe(false);
		});

		it('uses large step for growLarge command', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center', width: 200, height: 100 },
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, getState } = await pluginHarness(plugin, state);

			pm.executeCommand('resizeImageGrowLarge');

			const block = getState().getBlock('img1' as BlockId);
			expect(block?.attrs?.width).toBe(250);
		});
	});

	describe('resetImageSize', () => {
		it('removes width and height attributes', async () => {
			const state = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center', width: 200, height: 100 },
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm, getState } = await pluginHarness(plugin, state);

			const result = pm.executeCommand('resetImageSize');
			expect(result).toBe(true);

			const block = getState().getBlock('img1' as BlockId);
			expect(block?.attrs?.width).toBeUndefined();
			expect(block?.attrs?.height).toBeUndefined();
			expect(block?.attrs?.src).toBe('test.png');
		});

		it('returns false when no NodeSelection', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, state);

			expect(pm.executeCommand('resetImageSize')).toBe(false);
		});

		it('returns false when selected block is not image', async () => {
			const state = stateBuilder()
				.paragraph('Before', 'b1')
				.paragraph('After', 'b2')
				.nodeSelection('b1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, state);

			expect(pm.executeCommand('resetImageSize')).toBe(false);
		});
	});
});
