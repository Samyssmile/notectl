/**
 * Table Plugin Implementation
 */

import type { Plugin, PluginContext } from '@notectl/core';
import type { TableConfig, TableMenuConfig, CellPosition } from './types.js';
import { DEFAULT_TABLE_KEYMAP } from './types.js';
import { TableCommands } from './commands/tableCommands.js';
import { TableMenu } from './components/TableMenu.js';
import { getNextCell } from './utils/tableUtils.js';

/**
 * Default table configuration
 */
export const DEFAULT_TABLE_CONFIG: TableConfig = {
  defaultRows: 3,
  defaultCols: 3,
  allowMerge: true,
  allowSplit: true,
  minRows: 1,
  minCols: 1,
  headerRow: false,
  style: {
    border: '1px solid #ddd',
    borderColor: '#ddd',
    cellPadding: '8px',
    cellSpacing: '0',
    // No header styles - user can style cells themselves
    oddRowBg: '#fff',
    evenRowBg: '#fafafa',
  },
};

/**
 * Default table menu configuration
 */
export const DEFAULT_MENU_CONFIG: TableMenuConfig = {
  insertRowBefore: true,
  insertRowAfter: true,
  deleteRow: true,
  insertColBefore: true,
  insertColAfter: true,
  deleteCol: true,
  mergeCells: true,
  splitCell: true,
  deleteTable: true,
};

/**
 * Table Plugin
 */
export class TablePlugin implements Plugin {
  id = '@notectl/plugin-table';
  name = 'Table Plugin';
  version = '0.0.1';

  private context?: PluginContext;
  private commands?: TableCommands;
  private config: TableConfig;
  private menuConfig: TableMenuConfig;
  private currentMenu?: TableMenu;
  private currentTable?: string;
  private currentCell?: CellPosition;

  constructor(config: TableConfig = {}) {
    this.config = { ...DEFAULT_TABLE_CONFIG, ...config };
    this.menuConfig = DEFAULT_MENU_CONFIG;
  }

  async init(context: PluginContext): Promise<void> {
    this.context = context;
    this.commands = new TableCommands(context, this.config);

    // Register table commands
    this.registerCommands(context);

    // Setup keyboard navigation
    this.setupKeyboardNavigation(context);

    // Setup context menu
    this.setupContextMenu(context);

    console.log('Table plugin initialized', this.config);
  }

  async destroy(): Promise<void> {
    if (this.currentMenu) {
      this.currentMenu.close();
    }

    this.commands = undefined;
    this.context = undefined;
  }

  /**
   * Register table commands
   */
  private registerCommands(context: PluginContext): void {
    context.registerCommand('table.insert', (...args: unknown[]) => {
      const rows = args[0] as number | undefined;
      const cols = args[1] as number | undefined;
      this.commands!.insertTable(rows, cols);
    });

    context.registerCommand('table.insertRow', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const rowIndex = args[1] as number;
      const after = (args[2] as boolean | undefined) ?? true;
      this.commands!.insertRowAt(tableId, rowIndex, after);
    });

    context.registerCommand('table.deleteRow', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const rowIndex = args[1] as number;
      this.commands!.deleteRowAt(tableId, rowIndex);
    });

    context.registerCommand('table.insertCol', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const colIndex = args[1] as number;
      const after = (args[2] as boolean | undefined) ?? true;
      this.commands!.insertColumnAt(tableId, colIndex, after);
    });

    context.registerCommand('table.deleteCol', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const colIndex = args[1] as number;
      this.commands!.deleteColumnAt(tableId, colIndex);
    });

    context.registerCommand('table.mergeCells', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const start = args[1] as CellPosition;
      const end = (args[2] as CellPosition | undefined) || start;
      this.commands!.mergeCellsInRange(tableId, start, end);
    });

    context.registerCommand('table.splitCell', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const position = args[1] as CellPosition;
      this.commands!.splitCellAt(tableId, position);
    });

    context.registerCommand('table.delete', (...args: unknown[]) => {
      const tableId = args[0] as string;
      this.commands!.deleteTable(tableId);
    });

    context.registerCommand('table.setStyle', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const style = args[1] as Record<string, unknown>;
      this.commands!.setTableStyle(tableId, style);
    });

    context.registerCommand('table.navigate', (...args: unknown[]) => {
      const direction = args[0] as 'up' | 'down' | 'left' | 'right';
      this.navigateTable(direction);
    });

    context.registerCommand('table.showMenu', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const position = args[1] as CellPosition;
      const x = args[2] as number;
      const y = args[3] as number;
      this.showContextMenu(tableId, position, x, y);
    });
  }

  /**
   * Setup keyboard navigation for tables
   */
  private setupKeyboardNavigation(context: PluginContext): void {
    const keymap = DEFAULT_TABLE_KEYMAP;

    context.on('keydown', (event: any) => {
      if (!this.isInsideTable(event)) {
        return;
      }

      const key = this.getKeyString(event);

      switch (key) {
        case keymap.nextCell:
          event.preventDefault();
          this.navigateTable('right');
          break;

        case keymap.prevCell:
          event.preventDefault();
          this.navigateTable('left');
          break;

        case keymap.nextRow:
          event.preventDefault();
          this.navigateTable('down');
          break;

        case keymap.prevRow:
          event.preventDefault();
          this.navigateTable('up');
          break;

        case keymap.addRowAfter:
          event.preventDefault();
          if (this.currentTable && this.currentCell) {
            this.commands!.insertRowAt(this.currentTable, this.currentCell.row, true);
          }
          break;

        case keymap.addColAfter:
          event.preventDefault();
          if (this.currentTable && this.currentCell) {
            this.commands!.insertColumnAt(this.currentTable, this.currentCell.col, true);
          }
          break;

        case keymap.deleteRow:
          event.preventDefault();
          if (this.currentTable && this.currentCell) {
            this.commands!.deleteRowAt(this.currentTable, this.currentCell.row);
          }
          break;

        case keymap.deleteCol:
          event.preventDefault();
          if (this.currentTable && this.currentCell) {
            this.commands!.deleteColumnAt(this.currentTable, this.currentCell.col);
          }
          break;

        case keymap.deleteTable:
          event.preventDefault();
          if (this.currentTable) {
            this.commands!.deleteTable(this.currentTable);
          }
          break;
      }
    });
  }

  /**
   * Setup context menu for tables
   */
  private setupContextMenu(context: PluginContext): void {
    context.on('contextmenu', (event: any) => {
      if (this.isInsideTable(event)) {
        event.preventDefault();

        const tableId = this.getTableId(event);
        const position = this.getCellPosition(event);

        if (tableId && position) {
          this.showContextMenu(tableId, position, event.clientX, event.clientY);
        }
      }
    });
  }

  /**
   * Navigate table cells
   */
  private navigateTable(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (!this.currentTable || !this.currentCell) {
      return;
    }

    const state = this.context!.getState();
    const tableNode = this.findTableNode(state, this.currentTable);

    if (!tableNode) {
      return;
    }

    const table = tableNode.attrs?.table;
    const nextPos = getNextCell(table, this.currentCell, direction);

    if (nextPos) {
      this.currentCell = nextPos;
      // Move cursor to next cell
      this.context!.emit('table:navigate', {
        tableId: this.currentTable,
        position: nextPos,
      });
    }
  }

  /**
   * Show context menu
   */
  private showContextMenu(tableId: string, position: CellPosition, x: number, y: number): void {
    // Close existing menu
    if (this.currentMenu) {
      this.currentMenu.close();
    }

    // Create new menu
    this.currentMenu = new TableMenu(
      tableId,
      position,
      this.menuConfig,
      this.handleMenuCommand.bind(this)
    );

    this.currentMenu.positionAt(x, y);
    document.body.appendChild(this.currentMenu);
  }

  /**
   * Handle menu command
   */
  private handleMenuCommand(command: string, ...args: any[]): void {
    try {
      this.context!.executeCommand(command, ...args);
    } catch (error) {
      console.error(`Failed to execute table command: ${command}`, error);
      this.context!.emit('table:command-error', {
        command,
        error,
      });
    }
  }

  /**
   * Check if event is inside a table
   */
  private isInsideTable(event: any): boolean {
    const target = event.target as HTMLElement;
    return !!target.closest('[data-node-type="table"]');
  }

  /**
   * Get table ID from event
   */
  private getTableId(event: any): string | null {
    const target = event.target as HTMLElement;
    const table = target.closest('[data-node-type="table"]');
    return table?.getAttribute('data-block-id') || null;
  }

  /**
   * Get cell position from event
   */
  private getCellPosition(event: any): CellPosition | null {
    const target = event.target as HTMLElement;
    const cell = target.closest('[data-node-type="table_cell"]');

    if (!cell) {
      return null;
    }

    const row = parseInt(cell.getAttribute('data-row') || '0', 10);
    const col = parseInt(cell.getAttribute('data-col') || '0', 10);

    return { row, col };
  }

  /**
   * Get keyboard key string
   */
  private getKeyString(event: any): string {
    const parts: string[] = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    parts.push(event.key);

    return parts.join('+');
  }

  /**
   * Find table node in editor state
   */
  private findTableNode(state: any, tableId: string): any {
    // This would traverse the document to find the table node
    // For now, return a placeholder
    return state.document?.children?.find((node: any) => node.id === tableId);
  }
}

/**
 * Factory function to create table plugin
 */
export function createTablePlugin(config?: TableConfig): Plugin {
  return new TablePlugin(config);
}
