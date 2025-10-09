/**
 * Delta operations unit tests
 */

import { describe, it, expect } from 'vitest';
import type {
  InsertTextOperation,
  DeleteRangeOperation,
  ApplyMarkOperation,
  InsertBlockOperation,
  DeleteBlockOperation,
  SetAttrsOperation,
  WrapInOperation,
  LiftOutOperation,
} from '../../../src/delta/types';
import {
  insertTextOp,
  deleteRangeOp,
  applyMarkOp,
  insertBlockOp,
  deleteBlockOp,
} from '../../fixtures/deltas';

describe('Delta Operations', () => {
  describe('InsertTextOperation', () => {
    it('should have correct structure', () => {
      const op: InsertTextOperation = {
        op: 'insert_text',
        target: { blockId: 'p-1', offset: 0 },
        text: 'Hello',
      };

      expect(op.op).toBe('insert_text');
      expect(op.target).toEqual({ blockId: 'p-1', offset: 0 });
      expect(op.text).toBe('Hello');
    });

    it('should support marks', () => {
      const op: InsertTextOperation = {
        op: 'insert_text',
        target: { blockId: 'p-1', offset: 0 },
        text: 'Bold text',
        marks: [{ type: 'bold' }],
      };

      expect(op.marks).toHaveLength(1);
      expect(op.marks![0].type).toBe('bold');
    });

    it('should handle empty text', () => {
      const op: InsertTextOperation = {
        op: 'insert_text',
        target: { blockId: 'p-1', offset: 0 },
        text: '',
      };

      expect(op.text).toBe('');
    });

    it('should handle unicode and special characters', () => {
      const op: InsertTextOperation = {
        op: 'insert_text',
        target: { blockId: 'p-1', offset: 0 },
        text: '你好 🌍 café\n',
      };

      expect(op.text).toBe('你好 🌍 café\n');
    });
  });

  describe('DeleteRangeOperation', () => {
    it('should have correct structure', () => {
      const op: DeleteRangeOperation = {
        op: 'delete_range',
        range: {
          start: { blockId: 'p-1', offset: 0 },
          end: { blockId: 'p-1', offset: 5 },
        },
      };

      expect(op.op).toBe('delete_range');
      expect(op.range.start).toEqual({ blockId: 'p-1', offset: 0 });
      expect(op.range.end).toEqual({ blockId: 'p-1', offset: 5 });
    });

    it('should handle single character deletion', () => {
      const op: DeleteRangeOperation = {
        op: 'delete_range',
        range: {
          start: { blockId: 'p-1', offset: 5 },
          end: { blockId: 'p-1', offset: 6 },
        },
      };

      expect(op.range.end.offset - op.range.start.offset).toBe(1);
    });

    it('should handle cross-block ranges', () => {
      const op: DeleteRangeOperation = {
        op: 'delete_range',
        range: {
          start: { blockId: 'p-1', offset: 10 },
          end: { blockId: 'p-2', offset: 5 },
        },
      };

      expect(op.range.start.blockId).not.toBe(op.range.end.blockId);
    });

    it('should handle zero-width ranges', () => {
      const op: DeleteRangeOperation = {
        op: 'delete_range',
        range: {
          start: { blockId: 'p-1', offset: 5 },
          end: { blockId: 'p-1', offset: 5 },
        },
      };

      expect(op.range.start.offset).toBe(op.range.end.offset);
    });
  });

  describe('ApplyMarkOperation', () => {
    it('should apply mark to range', () => {
      const op: ApplyMarkOperation = {
        op: 'apply_mark',
        range: {
          start: { blockId: 'p-1', offset: 0 },
          end: { blockId: 'p-1', offset: 5 },
        },
        mark: { type: 'bold' },
        add: true,
      };

      expect(op.op).toBe('apply_mark');
      expect(op.mark.type).toBe('bold');
      expect(op.add).toBe(true);
    });

    it('should remove mark from range', () => {
      const op: ApplyMarkOperation = {
        op: 'apply_mark',
        range: {
          start: { blockId: 'p-1', offset: 0 },
          end: { blockId: 'p-1', offset: 5 },
        },
        mark: { type: 'bold' },
        add: false,
      };

      expect(op.add).toBe(false);
    });

    it('should support marks with attributes', () => {
      const op: ApplyMarkOperation = {
        op: 'apply_mark',
        range: {
          start: { blockId: 'p-1', offset: 0 },
          end: { blockId: 'p-1', offset: 5 },
        },
        mark: {
          type: 'link',
          attrs: { href: 'https://example.com' },
        },
        add: true,
      };

      expect(op.mark.attrs).toEqual({ href: 'https://example.com' });
    });
  });

  describe('InsertBlockOperation', () => {
    it('should insert block after target', () => {
      const op: InsertBlockOperation = {
        op: 'insert_block_after',
        after: 'p-1',
        block: {
          id: 'p-2',
          type: 'paragraph',
          children: [],
        },
      };

      expect(op.op).toBe('insert_block_after');
      expect(op.after).toBe('p-1');
      expect(op.block.id).toBe('p-2');
    });

    it('should insert block before target', () => {
      const op: InsertBlockOperation = {
        op: 'insert_block_before',
        before: 'p-2',
        block: {
          id: 'p-1',
          type: 'paragraph',
          children: [],
        },
      };

      expect(op.op).toBe('insert_block_before');
      expect(op.before).toBe('p-2');
    });

    it('should include block attributes', () => {
      const op: InsertBlockOperation = {
        op: 'insert_block_after',
        after: 'p-1',
        block: {
          id: 'h-1',
          type: 'heading',
          attrs: { level: 1 },
          children: [],
        },
      };

      expect(op.block.attrs).toEqual({ level: 1 });
    });

    it('should include block children', () => {
      const op: InsertBlockOperation = {
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

      expect(op.block.children).toHaveLength(1);
    });
  });

  describe('DeleteBlockOperation', () => {
    it('should delete block by ID', () => {
      const op: DeleteBlockOperation = {
        op: 'delete_block',
        target: { blockId: 'p-1' },
      };

      expect(op.op).toBe('delete_block');
      expect(op.target.blockId).toBe('p-1');
    });
  });

  describe('SetAttrsOperation', () => {
    it('should set block attributes', () => {
      const op: SetAttrsOperation = {
        op: 'set_attrs',
        target: { blockId: 'h-1' },
        attrs: { level: 2 },
      };

      expect(op.op).toBe('set_attrs');
      expect(op.attrs).toEqual({ level: 2 });
    });

    it('should handle multiple attributes', () => {
      const op: SetAttrsOperation = {
        op: 'set_attrs',
        target: { blockId: 'img-1' },
        attrs: {
          src: 'image.jpg',
          alt: 'Description',
          width: 800,
          height: 600,
        },
      };

      expect(Object.keys(op.attrs)).toHaveLength(4);
    });

    it('should handle empty attributes', () => {
      const op: SetAttrsOperation = {
        op: 'set_attrs',
        target: { blockId: 'p-1' },
        attrs: {},
      };

      expect(op.attrs).toEqual({});
    });
  });

  describe('WrapInOperation', () => {
    it('should wrap block in wrapper', () => {
      const op: WrapInOperation = {
        op: 'wrap_in',
        target: { blockId: 'p-1' },
        wrapperType: 'blockquote',
      };

      expect(op.op).toBe('wrap_in');
      expect(op.wrapperType).toBe('blockquote');
    });

    it('should include wrapper attributes', () => {
      const op: WrapInOperation = {
        op: 'wrap_in',
        target: { blockId: 'p-1' },
        wrapperType: 'div',
        attrs: { class: 'container' },
      };

      expect(op.attrs).toEqual({ class: 'container' });
    });
  });

  describe('LiftOutOperation', () => {
    it('should lift block out of parent', () => {
      const op: LiftOutOperation = {
        op: 'lift_out',
        target: { blockId: 'p-1' },
      };

      expect(op.op).toBe('lift_out');
      expect(op.target.blockId).toBe('p-1');
    });
  });

  describe('DeltaEnvelope', () => {
    it('should contain transaction metadata', () => {
      const envelope = {
        txnId: crypto.randomUUID(),
        clientId: 'client-1',
        timestamp: new Date().toISOString(),
        baseVersion: 5,
        ltime: 10,
        intent: 'edit' as const,
        ops: [insertTextOp],
      };

      expect(envelope.txnId).toMatch(/^[0-9a-f-]{36}$/);
      expect(envelope.clientId).toBe('client-1');
      expect(envelope.baseVersion).toBe(5);
      expect(envelope.ltime).toBe(10);
      expect(envelope.intent).toBe('edit');
      expect(envelope.ops).toHaveLength(1);
    });

    it('should support undo grouping', () => {
      const envelope = {
        txnId: crypto.randomUUID(),
        clientId: 'client-1',
        timestamp: new Date().toISOString(),
        baseVersion: 0,
        ltime: 0,
        intent: 'edit' as const,
        undoGroup: 'group-1',
        ops: [],
      };

      expect(envelope.undoGroup).toBe('group-1');
    });

    it('should support inverse operations', () => {
      const envelope = {
        txnId: crypto.randomUUID(),
        clientId: 'client-1',
        timestamp: new Date().toISOString(),
        baseVersion: 0,
        ltime: 0,
        intent: 'edit' as const,
        ops: [insertTextOp],
        inverseOps: [deleteRangeOp],
      };

      expect(envelope.inverseOps).toHaveLength(1);
    });

    it('should support validation constraints', () => {
      const envelope = {
        txnId: crypto.randomUUID(),
        clientId: 'client-1',
        timestamp: new Date().toISOString(),
        baseVersion: 0,
        ltime: 0,
        intent: 'edit' as const,
        ops: [],
        validation: {
          requiresSchemaVersion: '1.0.0',
          constraints: ['no-orphaned-blocks', 'valid-marks'],
        },
      };

      expect(envelope.validation?.requiresSchemaVersion).toBe('1.0.0');
      expect(envelope.validation?.constraints).toHaveLength(2);
    });
  });

  describe('operation composition', () => {
    it('should compose multiple operations', () => {
      const ops = [insertTextOp, applyMarkOp, deleteRangeOp];

      expect(ops).toHaveLength(3);
      expect(ops[0].op).toBe('insert_text');
      expect(ops[1].op).toBe('apply_mark');
      expect(ops[2].op).toBe('delete_range');
    });

    it('should maintain operation order', () => {
      const envelope = {
        txnId: crypto.randomUUID(),
        clientId: 'client-1',
        timestamp: new Date().toISOString(),
        baseVersion: 0,
        ltime: 0,
        intent: 'edit' as const,
        ops: [insertTextOp, applyMarkOp],
      };

      expect(envelope.ops[0]).toBe(insertTextOp);
      expect(envelope.ops[1]).toBe(applyMarkOp);
    });
  });
});
