/**
 * @notectl/plugin-toolbar
 *
 * Customizable toolbar plugin for Notectl
 */

// Export plugin implementation
export { ToolbarPlugin, createToolbarPlugin, DEFAULT_TOOLBAR_CONFIG } from './ToolbarPlugin.js';

// Export types
export type {
  ToolbarConfig,
  ToolbarButton,
  ToolbarDropdown,
  ToolbarItem,
  ButtonState,
  DropdownOption,
  ToolbarTableConfig,
} from './types.js';

// Export components
export { Toolbar } from './components/Toolbar.js';
export { ToolbarButtonComponent } from './components/Button.js';
export { ToolbarDropdownComponent } from './components/Dropdown.js';
export { TablePickerComponent } from './components/TablePicker.js';

// Export table types & defaults for configuration
export type {
  TableConfig,
  TableStyle,
  TableData,
  TableRow,
  TableCell,
  CellPosition,
  TableMenuConfig,
} from './table/index.js';
export { DEFAULT_TABLE_CONFIG, DEFAULT_MENU_CONFIG } from './table/index.js';

// Re-export for backward compatibility
import { createToolbarPlugin } from './ToolbarPlugin.js';
export default createToolbarPlugin;
