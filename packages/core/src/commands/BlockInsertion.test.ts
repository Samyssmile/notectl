import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	isBlockNode,
} from '../model/Document.js';
import type { AttrSpec } from '../model/NodeSpec.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import { TablePlugin } from '../plugins/table/TablePlugin.js';
import { EditorState } from '../state/EditorState.js';
import { pluginHarness, stateBuilder } from '../test/TestUtils.js';
import {
	canContainerHoldBlocks,
	cloneBlockWithNewIds,
	findBlockRecursive,
	findTableCellAncestor,
	resolveCellInsertionContext,
	resolveRootEscapeContext,
	resolveRootInsertionContext,
	sanitizeAttrs,
	validateRichBlockData,
} from './BlockInsertion.js';

// --- resolveRootInsertionContext ---

describe('resolveRootInsertionContext', () => {
	it('resolves context for a top-level block', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.cursor('b1', 0)
			.build();

		const ctx = resolveRootInsertionContext(state, blockId('b1'));
		expect(ctx).toBeDefined();
		expect(ctx?.parentPath).toEqual([]);
		expect(ctx?.anchorIndex).toBe(0);
		expect(ctx?.isAnchorEmpty).toBe(false);
	});

	it('detects empty anchor block', () => {
		const state = stateBuilder().paragraph('', 'b1').cursor('b1', 0).build();

		const ctx = resolveRootInsertionContext(state, blockId('b1'));
		expect(ctx).toBeDefined();
		expect(ctx?.isAnchorEmpty).toBe(true);
	});

	it('returns undefined for unknown block ID', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();

		const ctx = resolveRootInsertionContext(state, blockId('unknown'));
		expect(ctx).toBeUndefined();
	});

	it('resolves second block anchor index', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.paragraph('Third', 'b3')
			.cursor('b2', 0)
			.build();

		const ctx = resolveRootInsertionContext(state, blockId('b2'));
		expect(ctx?.anchorIndex).toBe(1);
	});
});

// --- resolveCellInsertionContext ---

describe('resolveCellInsertionContext', () => {
	it('resolves context for a block inside a table cell', () => {
		const cellChild: BlockNode = createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[createTextNode('cell text')],
			blockId('p1'),
		);
		const cell: BlockNode = createBlockNode(
			nodeType('table_cell') as NodeTypeName,
			[cellChild],
			blockId('cell1'),
		);
		const row: BlockNode = createBlockNode(
			nodeType('table_row') as NodeTypeName,
			[cell],
			blockId('row1'),
		);
		const table: BlockNode = createBlockNode(
			nodeType('table') as NodeTypeName,
			[row],
			blockId('table1'),
		);

		const state = stateBuilder()
			.nestedBlock(table)
			.cursor('p1', 0)
			.schema(['paragraph', 'table', 'table_row', 'table_cell'], [])
			.build();

		const ctx = resolveCellInsertionContext(state, blockId('p1'), blockId('cell1'));
		expect(ctx).toBeDefined();
		expect(ctx?.parentPath).toEqual([blockId('table1'), blockId('row1'), blockId('cell1')]);
		expect(ctx?.anchorIndex).toBe(0);
		expect(ctx?.isAnchorEmpty).toBe(false);
	});

	it('returns undefined for invalid cell ID', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();

		const ctx = resolveCellInsertionContext(state, blockId('b1'), blockId('nope'));
		expect(ctx).toBeUndefined();
	});
});

// --- findTableCellAncestor ---

describe('findTableCellAncestor', () => {
	it('returns block ID when block itself is a table cell', () => {
		const cell: BlockNode = createBlockNode(
			nodeType('table_cell') as NodeTypeName,
			[],
			blockId('cell1'),
		);
		const row: BlockNode = createBlockNode(
			nodeType('table_row') as NodeTypeName,
			[cell],
			blockId('row1'),
		);
		const table: BlockNode = createBlockNode(
			nodeType('table') as NodeTypeName,
			[row],
			blockId('table1'),
		);

		const state = stateBuilder()
			.nestedBlock(table)
			.cursor('cell1', 0)
			.schema(['paragraph', 'table', 'table_row', 'table_cell'], [])
			.build();

		expect(findTableCellAncestor(state, blockId('cell1'))).toBe(blockId('cell1'));
	});

	it('returns undefined for non-table block', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();

		expect(findTableCellAncestor(state, blockId('b1'))).toBeUndefined();
	});
});

// --- cloneBlockWithNewIds ---

describe('cloneBlockWithNewIds', () => {
	it('creates a clone with the given new ID', () => {
		const original: BlockNode = createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[createTextNode('Hello')],
			blockId('orig'),
		);

		const cloned = cloneBlockWithNewIds(original, blockId('new1'));
		expect(cloned.id).toBe(blockId('new1'));
		expect(getBlockText(cloned)).toBe('Hello');
		expect(cloned.type).toBe('paragraph');
	});

	it('recursively assigns new IDs to nested children', () => {
		const child: BlockNode = createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[createTextNode('nested')],
			blockId('child1'),
		);
		const parent: BlockNode = createBlockNode(
			nodeType('table_cell') as NodeTypeName,
			[child],
			blockId('parent1'),
		);

		const cloned = cloneBlockWithNewIds(parent, blockId('newParent'));
		expect(cloned.id).toBe(blockId('newParent'));
		const clonedChild = cloned.children[0];
		expect(isBlockNode(clonedChild)).toBe(true);
		if (isBlockNode(clonedChild)) {
			expect(clonedChild.id).not.toBe(blockId('child1'));
		}
	});
});

// --- findBlockRecursive ---

describe('findBlockRecursive', () => {
	it('finds the root block itself', () => {
		const block: BlockNode = createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[],
			blockId('b1'),
		);
		expect(findBlockRecursive(block, blockId('b1'))).toBe(block);
	});

	it('finds a deeply nested block', () => {
		const leaf: BlockNode = createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[createTextNode('leaf')],
			blockId('leaf'),
		);
		const mid: BlockNode = createBlockNode(
			nodeType('table_cell') as NodeTypeName,
			[leaf],
			blockId('mid'),
		);
		const root: BlockNode = createBlockNode(
			nodeType('table_row') as NodeTypeName,
			[mid],
			blockId('root'),
		);

		expect(findBlockRecursive(root, blockId('leaf'))).toBe(leaf);
	});

	it('returns undefined when not found', () => {
		const block: BlockNode = createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[],
			blockId('b1'),
		);
		expect(findBlockRecursive(block, blockId('missing'))).toBeUndefined();
	});
});

// --- sanitizeAttrs ---

describe('sanitizeAttrs', () => {
	const specAttrs: Readonly<Record<string, AttrSpec>> = {
		level: { default: 1 },
		custom: { default: 'none' },
	};

	it('keeps valid primitive attributes', () => {
		const result = sanitizeAttrs({ level: 2, custom: 'bold' }, specAttrs);
		expect(result).toEqual({ level: 2, custom: 'bold' });
	});

	it('falls back to defaults for non-primitive values', () => {
		const result = sanitizeAttrs({ level: { nested: true } as unknown }, specAttrs);
		expect(result).toEqual({ level: 1, custom: 'none' });
	});

	it('strips unknown keys', () => {
		const result = sanitizeAttrs({ level: 3, unknown: 'val' }, specAttrs);
		expect(result).toEqual({ level: 3, custom: 'none' });
	});

	it('returns undefined when no spec attrs declared', () => {
		expect(sanitizeAttrs({ level: 1 }, undefined)).toBeUndefined();
	});

	it('returns undefined when no keys match', () => {
		const emptySpec: Readonly<Record<string, AttrSpec>> = {};
		expect(sanitizeAttrs({ level: 1 }, emptySpec)).toBeUndefined();
	});

	it('accepts only explicitly declared immutable flat arrays for block attributes', () => {
		const structuredSpec: Readonly<Record<string, AttrSpec>> = {
			widths: { allowArray: true },
		};
		const source: (number | null)[] = [100, null, 200];
		const result = sanitizeAttrs({ widths: source }, structuredSpec, true);

		expect(result?.widths).toEqual([100, null, 200]);
		expect(result?.widths).not.toBe(source);
		expect(Object.isFrozen(result?.widths)).toBe(true);
		expect(sanitizeAttrs({ widths: source }, structuredSpec)).toBeUndefined();
		expect(
			sanitizeAttrs({ widths: [100, { css: 'url(x)' }] }, structuredSpec, true),
		).toBeUndefined();
		expect(sanitizeAttrs({ widths: [100, Number.NaN] }, structuredSpec, true)).toBeUndefined();
	});

	it('preserves declared structured block attributes through rich-data validation', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'structured',
			attrs: { widths: { allowArray: true } },
			toDOM: () => document.createElement('div'),
		});

		const validated = validateRichBlockData(
			{ type: 'structured', text: '', attrs: { widths: [100, null, 200] } },
			registry,
		);

		expect(validated?.attrs?.widths).toEqual([100, null, 200]);
		expect(Object.isFrozen(validated?.attrs?.widths)).toBe(true);
	});
});

// --- canContainerHoldBlocks ---

function tableBlock(): BlockNode {
	const cell: BlockNode = createBlockNode(
		nodeType('table_cell') as NodeTypeName,
		[createBlockNode(nodeType('paragraph') as NodeTypeName, [createTextNode('x')], blockId('p1'))],
		blockId('cell1'),
	);
	const row: BlockNode = createBlockNode(
		nodeType('table_row') as NodeTypeName,
		[cell],
		blockId('row1'),
	);
	return createBlockNode(nodeType('table') as NodeTypeName, [row], blockId('table1'));
}

describe('canContainerHoldBlocks', () => {
	it('allows any block at the document root (undefined container)', async () => {
		const h = await pluginHarness(new TablePlugin(), undefined, { builtinSpecs: true });
		expect(canContainerHoldBlocks(h.pm.schemaRegistry, undefined, [tableBlock()])).toBe(true);
	});

	it('rejects a table inside a table cell (schema-invalid nesting)', async () => {
		const h = await pluginHarness(new TablePlugin(), undefined, { builtinSpecs: true });
		expect(canContainerHoldBlocks(h.pm.schemaRegistry, 'table_cell', [tableBlock()])).toBe(false);
	});

	it('allows a paragraph inside a table cell', async () => {
		const h = await pluginHarness(new TablePlugin(), undefined, { builtinSpecs: true });
		const para: BlockNode = createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[createTextNode('hi')],
			blockId('pp'),
		);
		expect(canContainerHoldBlocks(h.pm.schemaRegistry, 'table_cell', [para])).toBe(true);
	});

	it('rejects the whole run when any block is disallowed', async () => {
		const h = await pluginHarness(new TablePlugin(), undefined, { builtinSpecs: true });
		const para: BlockNode = createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[createTextNode('hi')],
			blockId('pp'),
		);
		expect(canContainerHoldBlocks(h.pm.schemaRegistry, 'table_cell', [para, tableBlock()])).toBe(
			false,
		);
	});
});

// --- resolveRootEscapeContext ---

describe('resolveRootEscapeContext', () => {
	function stateWithTable(): EditorState {
		const doc = createDocument([
			createBlockNode(
				nodeType('paragraph') as NodeTypeName,
				[createTextNode('before')],
				blockId('b0'),
			),
			tableBlock(),
		]);
		return EditorState.create({ doc, selection: createCollapsedSelection(blockId('p1'), 0) });
	}

	it('escapes a cell anchor to the document root after its top-level table', () => {
		const ctx = resolveRootEscapeContext(stateWithTable(), blockId('p1'));
		expect(ctx).toEqual({ parentPath: [], anchorIndex: 1, isAnchorEmpty: false });
	});

	it('returns undefined for a block outside the document', () => {
		expect(resolveRootEscapeContext(stateWithTable(), blockId('nope'))).toBeUndefined();
	});
});
