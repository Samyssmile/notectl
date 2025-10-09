/**
 * Operational Transformation (OT) logic for concurrent editing
 */

import type { Operation } from './Operations.js';
import type { Delta } from './Delta.js';

/**
 * Transform operation A against operation B
 * Returns transformed version of A that can be applied after B
 */
export function transformOperation(opA: Operation, opB: Operation, side: 'left' | 'right'): Operation {
  // This is a simplified OT implementation
  // Full OT would require detailed transformation rules for each operation pair
  
  // For text operations, we need to adjust positions
  if (opA.op === 'insert_text' && opB.op === 'insert_text') {
    return transformInsertInsert(opA, opB, side);
  }
  
  if (opA.op === 'insert_text' && opB.op === 'delete_range') {
    return transformInsertDelete(opA, opB);
  }
  
  if (opA.op === 'delete_range' && opB.op === 'insert_text') {
    return transformDeleteInsert(opA, opB);
  }
  
  if (opA.op === 'delete_range' && opB.op === 'delete_range') {
    return transformDeleteDelete(opA, opB, side);
  }
  
  // For other operations, return as-is (naive approach)
  // A full implementation would handle all operation pairs
  return opA;
}

/**
 * Transform two concurrent insert operations
 */
function transformInsertInsert(
  opA: Extract<Operation, { op: 'insert_text' }>,
  opB: Extract<Operation, { op: 'insert_text' }>,
  side: 'left' | 'right'
): Operation {
  // If insertions are in the same block
  if (opA.target.blockId === opB.target.blockId) {
    // If B inserted before A's position, adjust A's offset
    if (opB.target.offset <= opA.target.offset) {
      return {
        ...opA,
        target: {
          ...opA.target,
          offset: opA.target.offset + opB.text.length,
        },
      };
    }
    // If B inserted at same position, use side to determine order
    if (opB.target.offset === opA.target.offset && side === 'right') {
      return {
        ...opA,
        target: {
          ...opA.target,
          offset: opA.target.offset + opB.text.length,
        },
      };
    }
  }
  return opA;
}

/**
 * Transform insert against delete
 */
function transformInsertDelete(
  opA: Extract<Operation, { op: 'insert_text' }>,
  opB: Extract<Operation, { op: 'delete_range' }>
): Operation {
  // If insertion is in the deleted range, move it to start of range
  if (opA.target.blockId === opB.range.start.blockId) {
    if (opA.target.offset >= opB.range.start.offset) {
      const deleteLength = opB.range.end.offset - opB.range.start.offset;
      return {
        ...opA,
        target: {
          ...opA.target,
          offset: Math.max(opB.range.start.offset, opA.target.offset - deleteLength),
        },
      };
    }
  }
  return opA;
}

/**
 * Transform delete against insert
 */
function transformDeleteInsert(
  opA: Extract<Operation, { op: 'delete_range' }>,
  opB: Extract<Operation, { op: 'insert_text' }>
): Operation {
  // If insert is before delete range, adjust delete positions
  if (opA.range.start.blockId === opB.target.blockId) {
    if (opB.target.offset <= opA.range.start.offset) {
      return {
        ...opA,
        range: {
          start: {
            ...opA.range.start,
            offset: opA.range.start.offset + opB.text.length,
          },
          end: {
            ...opA.range.end,
            offset: opA.range.end.offset + opB.text.length,
          },
        },
      };
    }
  }
  return opA;
}

/**
 * Transform two concurrent delete operations
 */
function transformDeleteDelete(
  opA: Extract<Operation, { op: 'delete_range' }>,
  opB: Extract<Operation, { op: 'delete_range' }>,
  _side: 'left' | 'right'
): Operation {
  // If ranges overlap, need to adjust A's range
  if (opA.range.start.blockId === opB.range.start.blockId) {
    const aStart = opA.range.start.offset;
    const aEnd = opA.range.end.offset;
    const bStart = opB.range.start.offset;
    const bEnd = opB.range.end.offset;
    
    // If B's delete is completely before A
    if (bEnd <= aStart) {
      const bLength = bEnd - bStart;
      return {
        ...opA,
        range: {
          start: { ...opA.range.start, offset: aStart - bLength },
          end: { ...opA.range.end, offset: aEnd - bLength },
        },
      };
    }
    
    // If B's delete overlaps with A, adjust accordingly
    // This is complex - simplified version here
    if (bStart <= aStart && bEnd >= aEnd) {
      // B deletes all of A's range - A becomes no-op (delete zero chars)
      return {
        ...opA,
        range: {
          start: { ...opA.range.start, offset: bStart },
          end: { ...opA.range.end, offset: bStart },
        },
      };
    }
  }
  return opA;
}

/**
 * Transform a delta against another delta
 * Returns transformed version of deltaA that can be applied after deltaB
 */
export function transformDelta(deltaA: Delta, deltaB: Delta, side: 'left' | 'right' = 'left'): Delta {
  const transformedOps = deltaA.ops.map((opA) => {
    let transformed = opA;
    for (const opB of deltaB.ops) {
      transformed = transformOperation(transformed, opB, side);
    }
    return transformed;
  });

  return {
    ...deltaA,
    ops: transformedOps,
    baseVersion: deltaB.baseVersion + 1, // Update to new base
  };
}

/**
 * Compose two deltas into a single delta
 * Applies deltaB after deltaA
 */
export function composeDelta(deltaA: Delta, deltaB: Delta): Delta {
  // Compose operations - this is simplified
  // Full implementation would optimize/merge operations
  return {
    ...deltaB,
    ops: [...deltaA.ops, ...deltaB.ops],
    baseVersion: deltaA.baseVersion,
  };
}

/**
 * Check if two deltas can be safely composed
 */
export function canCompose(deltaA: Delta, deltaB: Delta): boolean {
  // DeltaB should be based on the version after deltaA
  return deltaB.baseVersion === deltaA.baseVersion || deltaB.clientId === deltaA.clientId;
}
