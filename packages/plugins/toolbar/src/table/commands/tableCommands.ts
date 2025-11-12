/**
 * Table command implementations
 */

import type { PluginContext } from '@notectl/core';
import { createDelta } from '@notectl/core';
import type { TableConfig, CellPosition, TableData } from '../types.js';
import {
  createTable,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  mergeCells,
  splitCell,
} from '../utils/tableUtils.js';

/**
 * Table commands class
 */
export class TableCommands {
  constructor(
    private context: PluginContext,
    private config: TableConfig
  ) {}

  /**
   * Insert a new table
   */
  insertTable(rows?: number, cols?: number): void {
    const r = rows ?? this.config.defaultRows ?? 3;
    const c = cols ?? this.config.defaultCols ?? 3;

    // Create simple table - user can style cells themselves
    const table = createTable(r, c);

    // Apply delta to insert table
    const state = this.context.getState();
    const doc = state.getDocument();
    const lastBlock = doc.children[doc.children.length - 1];

    const delta = createDelta('table-plugin', doc.version)
      .setIntent('edit')
      .addOperation({
        op: 'insert_block_after',
        after: lastBlock?.id || 'root',
        block: {
          id: table.id,
          type: 'table',
          attrs: { table },
        },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:inserted', { tableId: table.id, rows: r, cols: c });
  }

  /**
   * Insert row before or after current row
   */
  insertRowAt(tableId: string, rowIndex: number, after = true): void {
    const state = this.context.getState();
    const tableNode = state.findBlock(tableId);

    if (!tableNode) {
      throw new Error(`Table ${tableId} not found`);
    }

    const table = tableNode.attrs?.table as TableData;
    const updatedTable = insertRow(table, rowIndex, after);

    const delta = createDelta('table-plugin', state.getVersion())
      .setIntent('edit')
      .addOperation({
        op: 'set_attrs',
        target: { blockId: tableId },
        attrs: { table: updatedTable },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:row-inserted', {
      tableId,
      rowIndex: after ? rowIndex + 1 : rowIndex,
    });
  }

  /**
   * Delete row at index
   */
  deleteRowAt(tableId: string, rowIndex: number): void {
    const state = this.context.getState();
    const tableNode = state.findBlock(tableId);

    if (!tableNode) {
      throw new Error(`Table ${tableId} not found`);
    }

    const table = tableNode.attrs?.table as TableData;
    const minRows = this.config.minRows ?? 1;
    const updatedTable = deleteRow(table, rowIndex, minRows);

    const delta = createDelta('table-plugin', state.getVersion())
      .setIntent('edit')
      .addOperation({
        op: 'set_attrs',
        target: { blockId: tableId },
        attrs: { table: updatedTable },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:row-deleted', { tableId, rowIndex });
  }

  /**
   * Insert column before or after current column
   */
  insertColumnAt(tableId: string, colIndex: number, after = true): void {
    const state = this.context.getState();
    const tableNode = state.findBlock(tableId);

    if (!tableNode) {
      throw new Error(`Table ${tableId} not found`);
    }

    const table = tableNode.attrs?.table as TableData;
    const updatedTable = insertColumn(table, colIndex, after);

    const delta = createDelta('table-plugin', state.getVersion())
      .setIntent('edit')
      .addOperation({
        op: 'set_attrs',
        target: { blockId: tableId },
        attrs: { table: updatedTable },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:column-inserted', {
      tableId,
      colIndex: after ? colIndex + 1 : colIndex,
    });
  }

  /**
   * Delete column at index
   */
  deleteColumnAt(tableId: string, colIndex: number): void {
    const state = this.context.getState();
    const tableNode = state.findBlock(tableId);

    if (!tableNode) {
      throw new Error(`Table ${tableId} not found`);
    }

    const table = tableNode.attrs?.table as TableData;
    const minCols = this.config.minCols ?? 1;
    const updatedTable = deleteColumn(table, colIndex, minCols);

    const delta = createDelta('table-plugin', state.getVersion())
      .setIntent('edit')
      .addOperation({
        op: 'set_attrs',
        target: { blockId: tableId },
        attrs: { table: updatedTable },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:column-deleted', { tableId, colIndex });
  }

  /**
   * Merge selected cells
   */
  mergeCellsInRange(tableId: string, start: CellPosition, end: CellPosition): void {
    if (!this.config.allowMerge) {
      throw new Error('Cell merging is disabled');
    }

    const state = this.context.getState();
    const tableNode = state.findBlock(tableId);

    if (!tableNode) {
      throw new Error(`Table ${tableId} not found`);
    }

    const table = tableNode.attrs?.table as TableData;
    const updatedTable = mergeCells(table, start, end);

    const delta = createDelta('table-plugin', state.getVersion())
      .setIntent('edit')
      .addOperation({
        op: 'set_attrs',
        target: { blockId: tableId },
        attrs: { table: updatedTable },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:cells-merged', { tableId, start, end });
  }

  /**
   * Split merged cell
   */
  splitCellAt(tableId: string, position: CellPosition): void {
    if (!this.config.allowSplit) {
      throw new Error('Cell splitting is disabled');
    }

    const state = this.context.getState();
    const tableNode = state.findBlock(tableId);

    if (!tableNode) {
      throw new Error(`Table ${tableId} not found`);
    }

    const table = tableNode.attrs?.table as TableData;
    const updatedTable = splitCell(table, position);

    const delta = createDelta('table-plugin', state.getVersion())
      .setIntent('edit')
      .addOperation({
        op: 'set_attrs',
        target: { blockId: tableId },
        attrs: { table: updatedTable },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:cell-split', { tableId, position });
  }

  /**
   * Delete entire table
   */
  deleteTable(tableId: string): void {
    const state = this.context.getState();

    const delta = createDelta('table-plugin', state.getVersion())
      .setIntent('edit')
      .addOperation({
        op: 'delete_block',
        target: { blockId: tableId },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:deleted', { tableId });
  }

  /**
   * Apply style to table
   */
  setTableStyle(tableId: string, style: Record<string, unknown>): void {
    const state = this.context.getState();
    const tableNode = state.findBlock(tableId);

    if (!tableNode) {
      throw new Error(`Table ${tableId} not found`);
    }

    const delta = createDelta('table-plugin', state.getVersion())
      .setIntent('format')
      .addOperation({
        op: 'set_attrs',
        target: { blockId: tableId },
        attrs: {
          ...(tableNode.attrs || {}),
          style: {
            ...(tableNode.attrs?.style || {}),
            ...style,
          },
        },
      })
      .build();

    this.context.applyDelta(delta);

    this.context.emit('table:style-updated', { tableId, style });
  }
}
