/**
 * Delta envelope - transactional container for operations
 */

import type { Operation } from './Operations.js';
import type { ValidationConstraint } from '../types/index.js';

/**
 * Validation metadata for delta
 */
export interface DeltaValidation {
  requiresSchemaVersion: string;
  constraints: ValidationConstraint[];
}

/**
 * Delta envelope containing operations and metadata
 */
export interface Delta {
  txnId: string;
  clientId: string;
  timestamp: string;
  baseVersion: number;
  ltime: number;
  intent: 'edit' | 'comment' | 'format' | 'import' | string;
  undoGroup?: string;
  ops: Operation[];
  inverseOps?: Operation[];
  validation?: DeltaValidation;
}

/**
 * Delta class for creating and managing deltas
 */
export class DeltaBuilder {
  private delta: Partial<Delta>;
  private operations: Operation[] = [];

  constructor(clientId: string, baseVersion: number) {
    this.delta = {
      txnId: this.generateTxnId(),
      clientId,
      timestamp: new Date().toISOString(),
      baseVersion,
      ltime: Date.now(),
      ops: [],
    };
  }

  /**
   * Set the intent of this delta
   */
  setIntent(intent: Delta['intent']): this {
    this.delta.intent = intent;
    return this;
  }

  /**
   * Set the undo group for batch operations
   */
  setUndoGroup(group: string): this {
    this.delta.undoGroup = group;
    return this;
  }

  /**
   * Add an operation to this delta
   */
  addOperation(op: Operation): this {
    this.operations.push(op);
    return this;
  }

  /**
   * Add multiple operations
   */
  addOperations(ops: Operation[]): this {
    this.operations.push(...ops);
    return this;
  }

  /**
   * Set inverse operations for fast undo
   */
  setInverseOps(inverseOps: Operation[]): this {
    this.delta.inverseOps = inverseOps;
    return this;
  }

  /**
   * Set validation constraints
   */
  setValidation(validation: DeltaValidation): this {
    this.delta.validation = validation;
    return this;
  }

  /**
   * Build the final delta
   */
  build(): Delta {
    if (this.operations.length === 0) {
      throw new Error('Delta must contain at least one operation');
    }

    return {
      ...this.delta,
      ops: this.operations,
    } as Delta;
  }

  /**
   * Generate a unique transaction ID
   */
  private generateTxnId(): string {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

/**
 * Utility function to create a delta builder
 */
export function createDelta(clientId: string, baseVersion: number): DeltaBuilder {
  return new DeltaBuilder(clientId, baseVersion);
}

/**
 * Compute inverse operations for undo
 * This is a simplified implementation - full implementation would inspect document state
 */
export function computeInverse(delta: Delta): Operation[] {
  // In a real implementation, this would:
  // 1. Examine each operation
  // 2. Query the document state to determine the inverse
  // 3. Return the inverse operations in reverse order
  
  // For now, return empty array (inverse ops should be provided explicitly)
  return delta.inverseOps || [];
}

/**
 * Validate a delta against constraints
 */
export function validateDelta(delta: Delta): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!delta.txnId) {
    errors.push('Delta must have a transaction ID');
  }

  if (!delta.clientId) {
    errors.push('Delta must have a client ID');
  }

  if (delta.ops.length === 0) {
    errors.push('Delta must contain at least one operation');
  }

  if (delta.baseVersion < 0) {
    errors.push('Base version must be non-negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
