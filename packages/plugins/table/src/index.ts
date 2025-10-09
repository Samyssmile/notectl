/**
 * @notectl/plugin-table
 *
 * Table support plugin for Notectl
 */

// Export plugin implementation
export {
  TablePlugin,
  createTablePlugin,
  DEFAULT_TABLE_CONFIG,
  DEFAULT_MENU_CONFIG,
} from './TablePlugin.js';

// Export types
export type {
  TableConfig,
  TableStyle,
  TableData,
  TableRow,
  TableCell,
  CellPosition,
  TableMenuConfig,
  TableKeyMap,
} from './types.js';

// Export commands
export { TableCommands } from './commands/tableCommands.js';

// Export utilities
export {
  createTable,
  createCell,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  mergeCells,
  splitCell,
  getTableDimensions,
  getNextCell,
  getCellAt,
  setCellAt,
  isValidPosition,
  getSelectedRange,
} from './utils/tableUtils.js';

// Export components
export { TableMenu } from './components/TableMenu.js';

// Re-export for backward compatibility
import { createTablePlugin } from './TablePlugin.js';
export default createTablePlugin;
