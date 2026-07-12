import { describe, expect, it } from 'vitest';
import {
	type BlockAttrs,
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
} from '../model/Document.js';
import { createCollapsedSelection, createPosition } from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { buildDeleteRowTransaction } from '../plugins/table/TableCommands.js';
import { TABLE_SCHEMA } from '../plugins/table/TableTestUtils.js';
import { EditorState } from './EditorState.js';
import { HistoryManager } from './History.js';
import {
	IDENTITY_MAP,
	Mapping,
	type MoveNodeMap,
	invertStepMap,
	mapChildIndex,
	mapInsertionIndex,
	mapPositionThroughStep,
	stepMapsEqual,
} from './Mapping.js';
import { applyStep, getStepMap, mapStep } from './StepHandlers.js';
import type { MoveNodeStep } from './Steps.js';

function paragraph(id: string): BlockNode {
	return createBlockNode('paragraph' as NodeTypeName, [createTextNode(id)], id as BlockId);
}

function container(id: string, children: readonly BlockNode[]): BlockNode {
	return createBlockNode('blockquote' as NodeTypeName, children, id as BlockId);
}

function stateWithContainers(): EditorState {
	return EditorState.create({
		doc: createDocument([
			container('left', [paragraph('a'), paragraph('b'), paragraph('c')]),
			container('right', [paragraph('d')]),
		]),
		selection: createCollapsedSelection('b' as BlockId, 1),
	});
}

function childIds(state: EditorState, parentId: string): readonly BlockId[] {
	const parent = state.getBlock(parentId as BlockId);
	return parent ? getBlockChildren(parent).map((child: BlockNode) => child.id) : [];
}

describe('MoveNodeStep', () => {
	it('moves a subtree across parents while preserving identity, selection, undo, and redo', () => {
		const initial = stateWithContainers();
		const transaction = initial
			.transaction('command')
			.moveNode(['left' as BlockId], 1, ['right' as BlockId], 1)
			.setSelection(initial.selection)
			.build();
		const after = initial.apply(transaction);

		expect(childIds(after, 'left')).toEqual(['a', 'c']);
		expect(childIds(after, 'right')).toEqual(['d', 'b']);
		expect(after.getBlock('b' as BlockId)).toBe(initial.getBlock('b' as BlockId));
		expect(after.selection.anchor.blockId).toBe('b');

		const history = new HistoryManager();
		history.push(transaction);
		const undone = history.undo(after);
		expect(undone?.state.doc).toEqual(initial.doc);
		const redone = undone ? history.redo(undone.state) : null;
		expect(redone?.state.doc).toEqual(after.doc);
	});

	it('uses pre-removal insertion-slot semantics for same-parent moves', () => {
		const initial = stateWithContainers();
		const downward = initial
			.transaction('command')
			.moveNode(['left' as BlockId], 0, ['left' as BlockId], 3)
			.build();
		const afterDownward = initial.apply(downward);
		expect(childIds(afterDownward, 'left')).toEqual(['b', 'c', 'a']);

		const downwardHistory = new HistoryManager();
		downwardHistory.push(downward);
		expect(downwardHistory.undo(afterDownward)?.state.doc).toEqual(initial.doc);

		const upward = initial
			.transaction('command')
			.moveNode(['left' as BlockId], 2, ['left' as BlockId], 0)
			.build();
		const afterUpward = initial.apply(upward);
		expect(childIds(afterUpward, 'left')).toEqual(['c', 'a', 'b']);

		const upwardHistory = new HistoryManager();
		upwardHistory.push(upward);
		const undone = upwardHistory.undo(afterUpward);
		expect(undone?.state.doc).toEqual(initial.doc);
		expect(undone ? upwardHistory.redo(undone.state)?.state.doc : null).toEqual(afterUpward.doc);
	});

	it('drops same-parent no-op moves without affecting later structural rebasing', () => {
		const initial = stateWithContainers();
		const pending = initial
			.transaction('api')
			.moveNode(['left' as BlockId], 1, ['left' as BlockId], 0)
			.build();
		const noOp = initial
			.transaction('api')
			.moveNode(['left' as BlockId], 0, ['left' as BlockId], 0)
			.moveNode(['left' as BlockId], 0, ['left' as BlockId], 1)
			.build();

		expect(noOp.steps).toEqual([]);
		expect(noOp.mapping).toBe(Mapping.empty);
		const current = initial.apply(noOp);
		expect(current.doc).toBe(initial.doc);

		const pendingStep = pending.steps[0] as MoveNodeStep;
		const mapped = mapStep(pendingStep, noOp.mapping, current.doc);
		expect(mapped).toBe(pendingStep);
		const after = mapped ? applyStep(current.doc, mapped) : current.doc;
		expect(getBlockChildren(after.children[0] as BlockNode).map((node) => node.id)).toEqual([
			'b',
			'a',
			'c',
		]);

		const manualNoOp: MoveNodeStep = {
			type: 'moveNode',
			fromParentPath: ['left' as BlockId],
			fromIndex: 0,
			toParentPath: ['left' as BlockId],
			toIndex: 0,
			movedNode: initial.getBlock('a' as BlockId) as BlockNode,
		};
		expect(getStepMap(initial.doc, manualNoOp)).toBe(IDENTITY_MAP);
		expect(applyStep(initial.doc, manualNoOp)).toBe(initial.doc);
	});

	it('rebases source and destination indices through intervening sibling insertions', () => {
		const initial = stateWithContainers();
		const move = initial
			.transaction('command')
			.moveNode(['left' as BlockId], 1, ['right' as BlockId], 1)
			.build();
		const moveStep = move.steps[0] as MoveNodeStep;

		const intervening = initial
			.transaction('api')
			.insertNode(['left' as BlockId], 0, paragraph('x'))
			.insertNode(['right' as BlockId], 0, paragraph('y'))
			.build();
		const current = initial.apply(intervening);
		const mapped = mapStep(moveStep, intervening.mapping, current.doc) as MoveNodeStep | null;

		expect(mapped).toMatchObject({ fromIndex: 2, toIndex: 2 });
		if (!mapped) return;
		const after = current.apply({
			...move,
			steps: [mapped],
			mapping: Mapping.from([getStepMap(current.doc, mapped)]),
			forwardStepMaps: [getStepMap(current.doc, mapped)],
		});
		expect(childIds(after, 'left')).toEqual(['x', 'a', 'c']);
		expect(childIds(after, 'right')).toEqual(['y', 'd', 'b']);
	});

	it('rejects a stale destination lineage without removing the source', () => {
		const initial = EditorState.create({
			doc: createDocument([
				container('A', [paragraph('s')]),
				container('B', [container('P', [paragraph('q')])]),
				container('C', []),
			]),
			selection: createCollapsedSelection('s' as BlockId, 0),
		});
		const pending = initial
			.transaction('api')
			.moveNode(['A' as BlockId], 0, ['B' as BlockId, 'P' as BlockId], 1)
			.build();
		const intervening = initial
			.transaction('api')
			.moveNode(['B' as BlockId], 0, ['C' as BlockId], 0)
			.build();
		const current = initial.apply(intervening);
		const pendingStep = pending.steps[0] as MoveNodeStep;

		expect(mapStep(pendingStep, intervening.mapping, current.doc)).toBeNull();
		const safelyRejected = applyStep(current.doc, pendingStep);
		expect(safelyRejected).toBe(current.doc);
		const source = safelyRejected.children.find((node) => node.id === ('A' as BlockId));
		expect(source ? getBlockChildren(source).map((node) => node.id) : []).toEqual(['s']);
	});

	it('produces an invertible structural map without deleting moved positions', () => {
		const initial = stateWithContainers();
		const step = initial
			.transaction('command')
			.moveNode(['left' as BlockId], 1, ['right' as BlockId], 1)
			.build().steps[0] as MoveNodeStep;
		const map = getStepMap(initial.doc, step) as MoveNodeMap;

		expect(mapPositionThroughStep(createPosition('b' as BlockId, 1), map)).toEqual({
			pos: createPosition('b' as BlockId, 1),
			deleted: false,
		});
		expect(mapChildIndex(['left' as BlockId], 2, Mapping.from([map]))).toBe(1);
		expect(mapInsertionIndex(['right' as BlockId], 1, Mapping.from([map]))).toBe(2);
		expect(
			stepMapsEqual(
				invertStepMap(map),
				getStepMap(applyStep(initial.doc, step), {
					type: 'moveNode',
					fromParentPath: step.toParentPath,
					fromIndex: map.destinationIndex,
					toParentPath: step.fromParentPath,
					toIndex: step.fromIndex,
					movedNode: step.movedNode,
				}),
			),
		).toBe(true);
	});

	it('undoes rowspan-owner row deletion after an intervening edit in the moved cell', () => {
		const tableCell = (id: string, attrs?: BlockAttrs): BlockNode =>
			createBlockNode(
				'table_cell' as NodeTypeName,
				[createBlockNode('paragraph' as NodeTypeName, [createTextNode(id)], `p-${id}` as BlockId)],
				id as BlockId,
				attrs,
			);
		const table = createBlockNode(
			'table' as NodeTypeName,
			[
				createBlockNode(
					'table_row' as NodeTypeName,
					[tableCell('a', { colspan: 2, rowspan: 2 }), tableCell('b')],
					'r0' as BlockId,
				),
				createBlockNode('table_row' as NodeTypeName, [tableCell('c')], 'r1' as BlockId),
			],
			'table' as BlockId,
		);
		const initial = EditorState.create({
			doc: createDocument([table]),
			selection: createCollapsedSelection('p-a' as BlockId, 1),
			schema: TABLE_SCHEMA,
		});
		const deletion = buildDeleteRowTransaction(initial, 'table' as BlockId, 0);
		expect(deletion).not.toBeNull();
		if (!deletion) return;

		const history = new HistoryManager();
		history.push(deletion);
		const afterDeletion = initial.apply(deletion);
		const intervening = afterDeletion
			.transaction('api')
			.insertText('p-a' as BlockId, 1, '!')
			.build();
		const current = afterDeletion.apply(intervening);
		history.recordIntervening(intervening.mapping);

		const undone = history.undo(current);
		expect(undone).not.toBeNull();
		if (!undone) return;
		const restoredTable = undone.state.getBlock('table' as BlockId) as BlockNode;
		const restoredRows = getBlockChildren(restoredTable);
		expect(restoredRows.map((row) => row.id)).toEqual(['r0', 'r1']);
		expect(getBlockChildren(restoredRows[0] as BlockNode).map((cell) => cell.id)).toEqual([
			'a',
			'b',
		]);
		expect(undone.state.getBlock('a' as BlockId)?.attrs).toEqual({ colspan: 2, rowspan: 2 });
		expect(undone.state.getBlock('p-a' as BlockId)?.children[0]).toMatchObject({ text: 'a!' });

		const redone = history.redo(undone.state);
		expect(redone).not.toBeNull();
		if (!redone) return;
		const redoneRows = getBlockChildren(redone.state.getBlock('table' as BlockId) as BlockNode);
		expect(redoneRows.map((row) => row.id)).toEqual(['r1']);
		expect(getBlockChildren(redoneRows[0] as BlockNode).map((cell) => cell.id)).toEqual(['a', 'c']);
		expect(redone.state.getBlock('p-a' as BlockId)?.children[0]).toMatchObject({ text: 'a!' });
	});
});
