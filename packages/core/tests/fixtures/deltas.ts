/**
 * Test fixtures for delta operations
 */

import type {
  DeltaEnvelope,
  InsertTextOperation,
  DeleteRangeOperation,
  ApplyMarkOperation,
  InsertBlockOperation,
  DeleteBlockOperation,
} from '../../src/delta/types';

export const createMockDeltaEnvelope = (
  overrides?: Partial<DeltaEnvelope>
): DeltaEnvelope => ({
  txnId: crypto.randomUUID(),
  clientId: 'client-1',
  timestamp: new Date().toISOString(),
  baseVersion: 0,
  ltime: 0,
  intent: 'edit',
  ops: [],
  ...overrides,
});

/**
 * Insert text operation
 */
export const insertTextOp: InsertTextOperation = {
  op: 'insert_text',
  target: { blockId: 'p-1', offset: 0 },
  text: 'Hello',
};

/**
 * Delete range operation
 */
export const deleteRangeOp: DeleteRangeOperation = {
  op: 'delete_range',
  range: {
    start: { blockId: 'p-1', offset: 0 },
    end: { blockId: 'p-1', offset: 5 },
  },
};

/**
 * Apply mark operation
 */
export const applyMarkOp: ApplyMarkOperation = {
  op: 'apply_mark',
  range: {
    start: { blockId: 'p-1', offset: 0 },
    end: { blockId: 'p-1', offset: 5 },
  },
  mark: { type: 'bold' },
  add: true,
};

/**
 * Insert block operation
 */
export const insertBlockOp: InsertBlockOperation = {
  op: 'insert_block_after',
  after: 'p-1',
  block: {
    id: 'p-2',
    type: 'paragraph',
    children: [
      {
        type: 'text',
        text: 'New paragraph',
      },
    ],
  },
};

/**
 * Delete block operation
 */
export const deleteBlockOp: DeleteBlockOperation = {
  op: 'delete_block',
  target: { blockId: 'p-1' },
};

/**
 * Complex delta with multiple operations
 */
export const complexDelta: DeltaEnvelope = {
  txnId: crypto.randomUUID(),
  clientId: 'client-1',
  timestamp: new Date().toISOString(),
  baseVersion: 0,
  ltime: 0,
  intent: 'edit',
  ops: [
    insertTextOp,
    applyMarkOp,
    {
      op: 'insert_text',
      target: { blockId: 'p-1', offset: 5 },
      text: ' world',
    },
  ],
};
