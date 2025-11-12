/**
 * Table manipulation utilities
 */

import type { TableData, TableRow, TableCell, CellPosition } from '../types.js';
import { generateBlockId } from '@notectl/core';

/**
 * Create an empty table with specified dimensions
 */
export function createTable(rows: number, cols: number): TableData {
  const tableId = generateBlockId();
  const tableRows: TableRow[] = [];

  for (let r = 0; r < rows; r++) {
    const rowId = generateBlockId();
    const cells: TableCell[] = [];

    for (let c = 0; c < cols; c++) {
      cells.push(createCell());
    }

    // No automatic header row - user can style cells themselves
    tableRows.push({
      id: rowId,
      cells,
    });
  }

  return {
    id: tableId,
    rows: tableRows,
  };
}

/**
 * Create an empty table cell
 */
export function createCell(rowSpan = 1, colSpan = 1): TableCell {
  return {
    id: generateBlockId(),
    rowSpan,
    colSpan,
    content: [],
  };
}

/**
 * Get cell at position
 */
export function getCellAt(table: TableData, position: CellPosition): TableCell | null {
  const row = table.rows[position.row];
  if (!row) return null;

  const cell = row.cells[position.col];
  return cell || null;
}

/**
 * Set cell at position
 */
export function setCellAt(table: TableData, position: CellPosition, cell: TableCell): TableData {
  const newRows = [...table.rows];
  const row = newRows[position.row];

  if (!row) {
    throw new Error(`Row ${position.row} does not exist`);
  }

  const newCells = [...row.cells];
  newCells[position.col] = cell;

  newRows[position.row] = {
    ...row,
    cells: newCells,
  };

  return {
    ...table,
    rows: newRows,
  };
}

/**
 * Insert row at index
 */
export function insertRow(table: TableData, rowIndex: number, after = true): TableData {
  const cols = table.rows[0]?.cells.length || 0;
  const newRow: TableRow = {
    id: generateBlockId(),
    cells: Array.from({ length: cols }, () => createCell()),
  };

  const insertIndex = after ? rowIndex + 1 : rowIndex;
  const newRows = [
    ...table.rows.slice(0, insertIndex),
    newRow,
    ...table.rows.slice(insertIndex),
  ];

  return {
    ...table,
    rows: newRows,
  };
}

/**
 * Delete row at index
 */
export function deleteRow(table: TableData, rowIndex: number, minRows = 1): TableData {
  if (table.rows.length <= minRows) {
    throw new Error(`Cannot delete row: table must have at least ${minRows} row(s)`);
  }

  const newRows = [
    ...table.rows.slice(0, rowIndex),
    ...table.rows.slice(rowIndex + 1),
  ];

  return {
    ...table,
    rows: newRows,
  };
}

/**
 * Insert column at index
 */
export function insertColumn(table: TableData, colIndex: number, after = true): TableData {
  const insertIndex = after ? colIndex + 1 : colIndex;

  const newRows = table.rows.map(row => ({
    ...row,
    cells: [
      ...row.cells.slice(0, insertIndex),
      createCell(),
      ...row.cells.slice(insertIndex),
    ],
  }));

  return {
    ...table,
    rows: newRows,
  };
}

/**
 * Delete column at index
 */
export function deleteColumn(table: TableData, colIndex: number, minCols = 1): TableData {
  const cols = table.rows[0]?.cells.length || 0;

  if (cols <= minCols) {
    throw new Error(`Cannot delete column: table must have at least ${minCols} column(s)`);
  }

  const newRows = table.rows.map(row => ({
    ...row,
    cells: [
      ...row.cells.slice(0, colIndex),
      ...row.cells.slice(colIndex + 1),
    ],
  }));

  return {
    ...table,
    rows: newRows,
  };
}

/**
 * Merge cells in a rectangular region
 */
export function mergeCells(
  table: TableData,
  startPos: CellPosition,
  endPos: CellPosition
): TableData {
  // Calculate dimensions of merged region
  const rowStart = Math.min(startPos.row, endPos.row);
  const rowEnd = Math.max(startPos.row, endPos.row);
  const colStart = Math.min(startPos.col, endPos.col);
  const colEnd = Math.max(startPos.col, endPos.col);

  const rowSpan = rowEnd - rowStart + 1;
  const colSpan = colEnd - colStart + 1;

  // Create merged cell
  const mergedCell = createCell(rowSpan, colSpan);

  // Collect content from all cells being merged
  const content: TableCell['content'] = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      const cell = getCellAt(table, { row: r, col: c });
      if (cell?.content && cell.content.length > 0) {
        content.push(...cell.content);
      }
    }
  }
  mergedCell.content = content;

  // Update table structure
  let newTable = { ...table };

  // Place merged cell at start position
  newTable = setCellAt(newTable, { row: rowStart, col: colStart }, mergedCell);

  // Mark other cells in the region as merged (set rowSpan/colSpan to 0)
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      if (r === rowStart && c === colStart) continue;

      const placeholder = createCell(0, 0);
      newTable = setCellAt(newTable, { row: r, col: c }, placeholder);
    }
  }

  return newTable;
}

/**
 * Split a merged cell back into individual cells
 */
export function splitCell(table: TableData, position: CellPosition): TableData {
  const cell = getCellAt(table, position);
  if (!cell || (cell.rowSpan === 1 && cell.colSpan === 1)) {
    return table; // Nothing to split
  }

  let newTable = { ...table };

  // Replace merged cell and placeholders with normal cells
  for (let r = 0; r < cell.rowSpan; r++) {
    for (let c = 0; c < cell.colSpan; c++) {
      const pos: CellPosition = {
        row: position.row + r,
        col: position.col + c,
      };

      // First cell gets the content, others are empty
      const newCell = createCell();
      if (r === 0 && c === 0 && cell.content) {
        newCell.content = cell.content;
      }

      newTable = setCellAt(newTable, pos, newCell);
    }
  }

  return newTable;
}

/**
 * Get table dimensions
 */
export function getTableDimensions(table: TableData): { rows: number; cols: number } {
  return {
    rows: table.rows.length,
    cols: table.rows[0]?.cells.length || 0,
  };
}

/**
 * Find next cell position for navigation
 */
export function getNextCell(
  table: TableData,
  position: CellPosition,
  direction: 'up' | 'down' | 'left' | 'right'
): CellPosition | null {
  const { rows, cols } = getTableDimensions(table);

  switch (direction) {
    case 'right':
      if (position.col < cols - 1) {
        return { row: position.row, col: position.col + 1 };
      } else if (position.row < rows - 1) {
        return { row: position.row + 1, col: 0 };
      }
      return null;

    case 'left':
      if (position.col > 0) {
        return { row: position.row, col: position.col - 1 };
      } else if (position.row > 0) {
        return { row: position.row - 1, col: cols - 1 };
      }
      return null;

    case 'down':
      if (position.row < rows - 1) {
        return { row: position.row + 1, col: position.col };
      }
      return null;

    case 'up':
      if (position.row > 0) {
        return { row: position.row - 1, col: position.col };
      }
      return null;
  }
}

/**
 * Check if position is valid in table
 */
export function isValidPosition(table: TableData, position: CellPosition): boolean {
  const { rows, cols } = getTableDimensions(table);
  return (
    position.row >= 0 &&
    position.row < rows &&
    position.col >= 0 &&
    position.col < cols
  );
}

/**
 * Get selected cells range
 */
export function getSelectedRange(
  start: CellPosition,
  end: CellPosition
): { rowStart: number; rowEnd: number; colStart: number; colEnd: number } {
  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  };
}
