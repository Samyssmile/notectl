/**
 * Delta operation definitions for Notectl
 * Implements the operations specified in the Delta Design document
 */

import type { BlockId, Position, Range, Mark, BlockNode, BlockAttrs } from '../types/index.js';

/**
 * Base operation interface
 */
export interface BaseOperation {
  op: string;
}

/**
 * Insert text at a position
 */
export interface InsertTextOp extends BaseOperation {
  op: 'insert_text';
  target: Position;
  text: string;
  marks?: Mark[];
}

/**
 * Delete text across a range
 */
export interface DeleteRangeOp extends BaseOperation {
  op: 'delete_range';
  range: Range;
}

/**
 * Apply or remove a mark across a range
 */
export interface ApplyMarkOp extends BaseOperation {
  op: 'apply_mark';
  range: Range;
  mark: Mark;
  add: boolean;
}

/**
 * Insert a block before another block
 */
export interface InsertBlockBeforeOp extends BaseOperation {
  op: 'insert_block_before';
  before: BlockId;
  block: BlockNode;
}

/**
 * Insert a block after another block
 */
export interface InsertBlockAfterOp extends BaseOperation {
  op: 'insert_block_after';
  after: BlockId;
  block: BlockNode;
}

/**
 * Delete a block
 */
export interface DeleteBlockOp extends BaseOperation {
  op: 'delete_block';
  target: { blockId: BlockId };
}

/**
 * Set attributes on a block
 */
export interface SetAttrsOp extends BaseOperation {
  op: 'set_attrs';
  target: { blockId: BlockId };
  attrs: BlockAttrs;
}

/**
 * Wrap blocks in a container
 */
export interface WrapInOp extends BaseOperation {
  op: 'wrap_in';
  blockIds: BlockId[];
  wrapperType: string;
  wrapperAttrs?: BlockAttrs;
}

/**
 * Lift blocks out of their container
 */
export interface LiftOutOp extends BaseOperation {
  op: 'lift_out';
  blockIds: BlockId[];
}

/**
 * Table operation: insert row
 */
export interface TableInsertRowOp extends BaseOperation {
  op: 'table_insert_row';
  target: { tableId: BlockId; rowIndex: number };
  row: BlockNode;
}

/**
 * Table operation: delete row
 */
export interface TableDeleteRowOp extends BaseOperation {
  op: 'table_delete_row';
  target: { tableId: BlockId; rowIndex: number };
}

/**
 * Table operation: insert column
 */
export interface TableInsertColOp extends BaseOperation {
  op: 'table_insert_col';
  target: { tableId: BlockId; colIndex: number };
}

/**
 * Table operation: delete column
 */
export interface TableDeleteColOp extends BaseOperation {
  op: 'table_delete_col';
  target: { tableId: BlockId; colIndex: number };
}

/**
 * Table operation: merge cells
 */
export interface TableMergeCellsOp extends BaseOperation {
  op: 'table_merge_cells';
  target: { tableId: BlockId; cells: BlockId[] };
}

/**
 * Table operation: split cell
 */
export interface TableSplitCellOp extends BaseOperation {
  op: 'table_split_cell';
  target: { tableId: BlockId; cellId: BlockId };
}

/**
 * Update selection/cursor
 */
export interface UpdateSelectionOp extends BaseOperation {
  op: 'update_selection';
  actorId: string;
  selection: {
    anchor: Position;
    head: Position;
  };
}

/**
 * Union of all operation types
 */
export type Operation =
  | InsertTextOp
  | DeleteRangeOp
  | ApplyMarkOp
  | InsertBlockBeforeOp
  | InsertBlockAfterOp
  | DeleteBlockOp
  | SetAttrsOp
  | WrapInOp
  | LiftOutOp
  | TableInsertRowOp
  | TableDeleteRowOp
  | TableInsertColOp
  | TableDeleteColOp
  | TableMergeCellsOp
  | TableSplitCellOp
  | UpdateSelectionOp;

/**
 * Type guard for operation types
 */
export function isTextOperation(op: Operation): op is InsertTextOp | DeleteRangeOp | ApplyMarkOp {
  return op.op === 'insert_text' || op.op === 'delete_range' || op.op === 'apply_mark';
}

export function isBlockOperation(
  op: Operation
): op is InsertBlockBeforeOp | InsertBlockAfterOp | DeleteBlockOp | SetAttrsOp {
  return (
    op.op === 'insert_block_before' ||
    op.op === 'insert_block_after' ||
    op.op === 'delete_block' ||
    op.op === 'set_attrs'
  );
}

export function isTableOperation(op: Operation): boolean {
  return op.op.startsWith('table_');
}

export function isSelectionOperation(op: Operation): op is UpdateSelectionOp {
  return op.op === 'update_selection';
}
