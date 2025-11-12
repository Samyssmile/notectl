/**
 * Table feature implementation embedded into the toolbar plugin
 */

import type { PluginContext } from '@notectl/core';
import type { CellPosition, TableConfig, TableMenuConfig } from './types.js';
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

export interface TableFeatureOptions {
  config?: TableConfig;
  menuConfig?: TableMenuConfig;
}

/**
 * Table feature used by the toolbar plugin
 */
export class TableFeature {
  private context?: PluginContext;
  private commands?: TableCommands;
  private config: TableConfig;
  private menuConfig: TableMenuConfig;
  private currentMenu?: TableMenu;
  private currentTable?: string;
  private currentCell?: CellPosition;
  private keyboardHandler?: (event: any) => void;
  private contextMenuHandler?: (event: any) => void;

  constructor(options: TableFeatureOptions = {}) {
    this.config = { ...DEFAULT_TABLE_CONFIG, ...(options.config ?? {}) };
    this.menuConfig = { ...DEFAULT_MENU_CONFIG, ...(options.menuConfig ?? {}) };
  }

  init(context: PluginContext): void {
    if (this.context) {
      return;
    }

    this.context = context;
    this.commands = new TableCommands(context, this.config);

    this.registerCommands(context);
    this.setupKeyboardNavigation();
    this.setupContextMenu();
  }

  updateConfig(options: TableFeatureOptions): void {
    this.config = { ...DEFAULT_TABLE_CONFIG, ...(options.config ?? {}) };
    this.menuConfig = { ...DEFAULT_MENU_CONFIG, ...(options.menuConfig ?? {}) };

    if (this.context) {
      this.commands = new TableCommands(this.context, this.config);
    }
  }

  destroy(): void {
    if (this.currentMenu) {
      this.currentMenu.close();
      this.currentMenu = undefined;
    }

    if (this.context && this.keyboardHandler) {
      this.context.off('keydown', this.keyboardHandler);
      this.keyboardHandler = undefined;
    }

    if (this.context && this.contextMenuHandler) {
      this.context.off('contextmenu', this.contextMenuHandler);
      this.contextMenuHandler = undefined;
    }

    this.commands = undefined;
    this.context = undefined;
    this.currentTable = undefined;
    this.currentCell = undefined;
  }

  /**
   * Register table commands
   */
  private registerCommands(context: PluginContext): void {
    context.registerCommand('table.insert', (...args: unknown[]) => {
      const rows = args[0] as number | undefined;
      const cols = args[1] as number | undefined;
      this.commands?.insertTable(rows, cols);
    });

    context.registerCommand('table.insertRow', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const rowIndex = args[1] as number;
      const after = (args[2] as boolean | undefined) ?? true;
      this.commands?.insertRowAt(tableId, rowIndex, after);
    });

    context.registerCommand('table.deleteRow', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const rowIndex = args[1] as number;
      this.commands?.deleteRowAt(tableId, rowIndex);
    });

    context.registerCommand('table.insertCol', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const colIndex = args[1] as number;
      const after = (args[2] as boolean | undefined) ?? true;
      this.commands?.insertColumnAt(tableId, colIndex, after);
    });

    context.registerCommand('table.deleteCol', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const colIndex = args[1] as number;
      this.commands?.deleteColumnAt(tableId, colIndex);
    });

    context.registerCommand('table.mergeCells', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const start = args[1] as CellPosition;
      const end = (args[2] as CellPosition | undefined) || start;
      this.commands?.mergeCellsInRange(tableId, start, end);
    });

    context.registerCommand('table.splitCell', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const position = args[1] as CellPosition;
      this.commands?.splitCellAt(tableId, position);
    });

    context.registerCommand('table.delete', (...args: unknown[]) => {
      const tableId = args[0] as string;
      this.commands?.deleteTable(tableId);
    });

    context.registerCommand('table.setStyle', (...args: unknown[]) => {
      const tableId = args[0] as string;
      const style = args[1] as Record<string, unknown>;
      this.commands?.setTableStyle(tableId, style);
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
  private setupKeyboardNavigation(): void {
    if (!this.context) {
      return;
    }

    const keymap = DEFAULT_TABLE_KEYMAP;

    this.keyboardHandler = (event: any) => {
      if (!this.isInsideTable(event)) {
        return;
      }

      const tableId = this.getTableId(event);
      const position = this.getCellPosition(event);
      if (tableId && position) {
        this.currentTable = tableId;
        this.currentCell = position;
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
            this.commands?.insertRowAt(this.currentTable, this.currentCell.row, true);
          }
          break;

        case keymap.addColAfter:
          event.preventDefault();
          if (this.currentTable && this.currentCell) {
            this.commands?.insertColumnAt(this.currentTable, this.currentCell.col, true);
          }
          break;

        case keymap.deleteRow:
          event.preventDefault();
          if (this.currentTable && this.currentCell) {
            this.commands?.deleteRowAt(this.currentTable, this.currentCell.row);
          }
          break;

        case keymap.deleteCol:
          event.preventDefault();
          if (this.currentTable && this.currentCell) {
            this.commands?.deleteColumnAt(this.currentTable, this.currentCell.col);
          }
          break;

        case keymap.deleteTable:
          event.preventDefault();
          if (this.currentTable) {
            this.commands?.deleteTable(this.currentTable);
          }
          break;
      }
    };

    this.context.on('keydown', this.keyboardHandler);
  }

  /**
   * Setup context menu for tables
   */
  private setupContextMenu(): void {
    if (!this.context) {
      return;
    }

    this.contextMenuHandler = (event: any) => {
      if (!this.isInsideTable(event)) {
        return;
      }

      event.preventDefault();

      const tableId = this.getTableId(event);
      const position = this.getCellPosition(event);

      if (tableId && position) {
        this.currentTable = tableId;
        this.currentCell = position;
        this.showContextMenu(tableId, position, event.clientX, event.clientY);
      }
    };

    this.context.on('contextmenu', this.contextMenuHandler);
  }

  /**
   * Navigate table cells
   */
  private navigateTable(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (!this.currentTable || !this.currentCell || !this.context) {
      return;
    }

    const state = this.context.getState();
    const tableNode = this.findTableNode(state, this.currentTable);

    if (!tableNode?.attrs?.table) {
      return;
    }

    const nextPos = getNextCell(tableNode.attrs.table, this.currentCell, direction);

    if (nextPos) {
      this.currentCell = nextPos;
      this.context.emit('table:navigate', {
        tableId: this.currentTable,
        position: nextPos,
      });
    }
  }

  /**
   * Show context menu
   */
  private showContextMenu(tableId: string, position: CellPosition, x: number, y: number): void {
    if (this.currentMenu) {
      this.currentMenu.close();
    }

    this.currentTable = tableId;
    this.currentCell = position;

    this.currentMenu = new TableMenu(tableId, position, this.menuConfig, this.handleMenuCommand.bind(this));
    this.currentMenu.positionAt(x, y);
    document.body.appendChild(this.currentMenu);
  }

  /**
   * Handle menu command
   */
  private handleMenuCommand(command: string, ...args: any[]): void {
    try {
      this.context?.executeCommand(command, ...args);
    } catch (error) {
      console.error(`Failed to execute table command: ${command}`, error);
      this.context?.emit('table:command-error', {
        command,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isInsideTable(event: any): boolean {
    const target = event.target as HTMLElement;
    return !!target?.closest('[data-node-type="table"]');
  }

  private getTableId(event: any): string | null {
    const target = event.target as HTMLElement;
    const table = target?.closest('[data-node-type="table"]');
    return table?.getAttribute('data-block-id') || null;
  }

  private getCellPosition(event: any): CellPosition | null {
    const target = event.target as HTMLElement;
    const cell = target?.closest('[data-node-type="table_cell"]');

    if (!cell) {
      return null;
    }

    const row = parseInt(cell.getAttribute('data-row') || '0', 10);
    const col = parseInt(cell.getAttribute('data-col') || '0', 10);

    return { row, col };
  }

  private getKeyString(event: any): string {
    const parts: string[] = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    parts.push(event.key);

    return parts.join('+');
  }

  private findTableNode(state: any, tableId: string): any {
    if (typeof state.findBlock === 'function') {
      return state.findBlock(tableId);
    }

    const doc = typeof state.getDocument === 'function' ? state.getDocument() : state.document;
    if (!doc?.children) {
      return undefined;
    }

    return doc.children.find((node: any) => node.id === tableId);
  }
}
