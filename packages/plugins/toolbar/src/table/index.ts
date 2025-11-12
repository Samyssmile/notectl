/**
 * Table feature exports for the toolbar plugin
 */

export { TableFeature, DEFAULT_TABLE_CONFIG, DEFAULT_MENU_CONFIG } from './TableFeature.js';

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

export { TableCommands } from './commands/tableCommands.js';

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

export { TableMenu } from './components/TableMenu.js';
