/**
 * Type definitions for toolbar plugin
 */

import type { TableConfig, TableMenuConfig } from './table/types.js';

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
 * Toolbar configuration
 */
export interface ToolbarConfig {
  items?: ToolbarItem[];
  position?: 'top' | 'bottom' | 'floating';
  theme?: 'light' | 'dark' | 'auto';
  sticky?: boolean;
  showLabels?: boolean;
  table?: ToolbarTableConfig;
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
