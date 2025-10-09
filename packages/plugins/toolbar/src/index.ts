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
} from './types.js';

// Export components
export { Toolbar } from './components/Toolbar.js';
export { ToolbarButtonComponent } from './components/Button.js';
export { ToolbarDropdownComponent } from './components/Dropdown.js';
export { TablePickerComponent } from './components/TablePicker.js';

// Re-export for backward compatibility
import { createToolbarPlugin } from './ToolbarPlugin.js';
export default createToolbarPlugin;
