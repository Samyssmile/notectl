/**
 * Type definitions for table plugin
 */

import type { BlockId, BlockNode } from '@notectl/core';

/**
 * Table cell position
 */
export interface CellPosition {
  row: number;
  col: number;
}

/**
 * Table cell data
 */
export interface TableCell {
  id: BlockId;
  rowSpan: number;
  colSpan: number;
  content?: BlockNode[];
  attrs?: Record<string, unknown>;
}

/**
 * Table row data
 */
export interface TableRow {
  id: BlockId;
  cells: TableCell[];
  attrs?: Record<string, unknown>;
}

/**
 * Table structure
 */
export interface TableData {
  id: BlockId;
  rows: TableRow[];
  attrs?: Record<string, unknown>;
}

/**
 * Table configuration options
 */
export interface TableConfig {
  defaultRows?: number;
  defaultCols?: number;
  allowMerge?: boolean;
  allowSplit?: boolean;
  minRows?: number;
  minCols?: number;
  headerRow?: boolean;
  style?: TableStyle;
}

/**
 * Table styling options
 */
export interface TableStyle {
  border?: string;
  borderColor?: string;
  cellPadding?: string;
  cellSpacing?: string;
  headerBg?: string;
  headerColor?: string;
  oddRowBg?: string;
  evenRowBg?: string;
}

/**
 * Table menu configuration
 */
export interface TableMenuConfig {
  insertRowBefore: boolean;
  insertRowAfter: boolean;
  deleteRow: boolean;
  insertColBefore: boolean;
  insertColAfter: boolean;
  deleteCol: boolean;
  mergeCells: boolean;
  splitCell: boolean;
  deleteTable: boolean;
}

/**
 * Table keyboard shortcuts
 */
export interface TableKeyMap {
  nextCell: string;
  prevCell: string;
  nextRow: string;
  prevRow: string;
  addRowAfter: string;
  addColAfter: string;
  deleteRow: string;
  deleteCol: string;
  deleteTable: string;
}

/**
 * Default table keyboard shortcuts
 */
export const DEFAULT_TABLE_KEYMAP: TableKeyMap = {
  nextCell: 'Tab',
  prevCell: 'Shift+Tab',
  nextRow: 'Enter',
  prevRow: 'Shift+Enter',
  addRowAfter: 'Ctrl+Enter',
  addColAfter: 'Ctrl+Shift+Enter',
  deleteRow: 'Ctrl+Shift+Backspace',
  deleteCol: 'Ctrl+Alt+Backspace',
  deleteTable: 'Ctrl+Shift+Delete',
};
