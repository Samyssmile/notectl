/**
 * Re-export word boundary functions from model layer.
 * The implementations live in model/WordBoundary.ts as they are pure
 * functions that only depend on model types (BlockNode).
 */

export { findWordBoundaryBackward, findWordBoundaryForward } from '../model/WordBoundary.js';
