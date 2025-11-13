/**
 * Type definitions for toolbar plugin
 */

import type { TableConfig, TableMenuConfig } from './table/types.js';

/**
 * Extend the core editor event map with toolbar plugin events
 * This uses TypeScript declaration merging to add plugin-specific events
 */
declare module '@notectl/core' {
  interface PluginEventMap {
    /**
     * Fired when a table is inserted into the document
     */
    'table:inserted': {
      tableId: string;
      rows: number;
      cols: number;
      position?: { blockId: string };
    };

    /**
     * Fired when a row is inserted into a table
     */
    'table:row-inserted': {
      tableId: string;
      rowIndex: number;
      position: 'before' | 'after';
    };

    /**
     * Fired when a column is inserted into a table
     */
    'table:column-inserted': {
      tableId: string;
      colIndex: number;
      position: 'before' | 'after';
    };

    /**
     * Fired when a row is deleted from a table
     */
    'table:row-deleted': {
      tableId: string;
      rowIndex: number;
    };

    /**
     * Fired when a column is deleted from a table
     */
    'table:column-deleted': {
      tableId: string;
      colIndex: number;
    };

    /**
     * Fired when a table command fails
     */
    'table:command-error': {
      command: string;
      error: string;
      tableId?: string;
    };
  }
}

/**
 * Toolbar button configuration
 */
export interface ToolbarButton {
  id: string;
  label: string;
  icon?: string;
  command: string;
  args?: unknown[];
  tooltip?: string;
  group?: string;
}

/**
 * Toolbar dropdown option
 */
export interface DropdownOption {
  label: string;
  value: string | number;
  command?: string;
  args?: unknown[];
}

/**
 * Toolbar dropdown configuration
 */
export interface ToolbarDropdown {
  id: string;
  label: string;
  options: DropdownOption[];
  tooltip?: string;
  group?: string;
}

/**
 * Toolbar item union type
 */
export type ToolbarItem = ToolbarButton | ToolbarDropdown;

/**
 * Toolbar font configuration
 */
export type ToolbarFontFamilyOptionInput = string | ToolbarFontFamilyOption;

export interface ToolbarFontFamilyOption {
  label: string;
  value: string;
}

export interface ToolbarFontsConfig {
  families?: ToolbarFontFamilyOptionInput[];
  /**
   * When false the dropdown will only show the provided values.
   * Defaults to true to append custom fonts to the built-in set.
   */
  extendDefaults?: boolean;
}

/**
 * Toolbar configuration
 */
export interface ToolbarConfig {
  items?: ToolbarItem[];
  position?: 'top' | 'bottom' | 'floating';
  theme?: 'light' | 'dark' | 'auto';
  sticky?: boolean;
  showLabels?: boolean;
  table?: ToolbarTableConfig;
  fonts?: ToolbarFontsConfig;
}

/**
 * Toolbar button state
 */
export interface ButtonState {
  active: boolean;
  disabled: boolean;
}

/**
 * Type guard for toolbar button
 */
export function isToolbarButton(item: ToolbarItem): item is ToolbarButton {
  return 'command' in item && !('options' in item);
}

/**
 * Type guard for toolbar dropdown
 */
export function isToolbarDropdown(item: ToolbarItem): item is ToolbarDropdown {
  return 'options' in item;
}

/**
 * Toolbar table configuration
 */
export interface ToolbarTableConfig {
  enabled?: boolean;
  config?: TableConfig;
  menu?: Partial<TableMenuConfig>;
}
