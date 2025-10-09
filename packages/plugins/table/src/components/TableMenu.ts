/**
 * Table Context Menu Component
 */

import type { CellPosition, TableMenuConfig } from '../types.js';

/**
 * Table context menu
 */
export class TableMenu extends HTMLElement {
  private config: TableMenuConfig;
  private position: CellPosition;
  private tableId: string;
  private menu: HTMLDivElement;
  private onCommand: (command: string, ...args: any[]) => void;

  constructor(
    tableId: string,
    position: CellPosition,
    config: TableMenuConfig,
    onCommand: (command: string, ...args: any[]) => void
  ) {
    super();
    this.tableId = tableId;
    this.position = position;
    this.config = config;
    this.onCommand = onCommand;

    this.menu = document.createElement('div');
    this.setupMenu();
  }

  connectedCallback(): void {
    this.appendChild(this.menu);
    this.setupEventListeners();
  }

  disconnectedCallback(): void {
    this.cleanup();
  }

  /**
   * Setup menu structure
   */
  private setupMenu(): void {
    this.menu.className = 'notectl-table-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', 'Table operations');

    const menuItems: Array<{
      id: string;
      label: string;
      command: string;
      enabled: boolean;
      divider?: boolean;
    }> = [];

    if (this.config.insertRowBefore) {
      menuItems.push({
        id: 'insert-row-before',
        label: 'Insert Row Before',
        command: 'insertRowBefore',
        enabled: true,
      });
    }

    if (this.config.insertRowAfter) {
      menuItems.push({
        id: 'insert-row-after',
        label: 'Insert Row After',
        command: 'insertRowAfter',
        enabled: true,
      });
    }

    if (this.config.deleteRow) {
      menuItems.push({
        id: 'delete-row',
        label: 'Delete Row',
        command: 'deleteRow',
        enabled: true,
        divider: true,
      });
    }

    if (this.config.insertColBefore) {
      menuItems.push({
        id: 'insert-col-before',
        label: 'Insert Column Before',
        command: 'insertColBefore',
        enabled: true,
      });
    }

    if (this.config.insertColAfter) {
      menuItems.push({
        id: 'insert-col-after',
        label: 'Insert Column After',
        command: 'insertColAfter',
        enabled: true,
      });
    }

    if (this.config.deleteCol) {
      menuItems.push({
        id: 'delete-col',
        label: 'Delete Column',
        command: 'deleteCol',
        enabled: true,
        divider: true,
      });
    }

    if (this.config.mergeCells) {
      menuItems.push({
        id: 'merge-cells',
        label: 'Merge Cells',
        command: 'mergeCells',
        enabled: true,
      });
    }

    if (this.config.splitCell) {
      menuItems.push({
        id: 'split-cell',
        label: 'Split Cell',
        command: 'splitCell',
        enabled: true,
        divider: true,
      });
    }

    if (this.config.deleteTable) {
      menuItems.push({
        id: 'delete-table',
        label: 'Delete Table',
        command: 'deleteTable',
        enabled: true,
      });
    }

    // Render menu items
    menuItems.forEach(item => {
      const button = document.createElement('button');
      button.className = 'notectl-table-menu-item';
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.setAttribute('data-command', item.command);
      button.textContent = item.label;
      button.disabled = !item.enabled;

      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleCommand(item.command);
      });

      this.menu.appendChild(button);

      if (item.divider) {
        const divider = document.createElement('div');
        divider.className = 'notectl-table-menu-divider';
        this.menu.appendChild(divider);
      }
    });

    // Add styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.menu.appendChild(style);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Close menu on outside click
    document.addEventListener('click', this.handleOutsideClick.bind(this));

    // Keyboard navigation
    this.menu.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Handle command execution
   */
  private handleCommand(command: string): void {
    switch (command) {
      case 'insertRowBefore':
        this.onCommand('table.insertRow', this.tableId, this.position.row, false);
        break;

      case 'insertRowAfter':
        this.onCommand('table.insertRow', this.tableId, this.position.row, true);
        break;

      case 'deleteRow':
        this.onCommand('table.deleteRow', this.tableId, this.position.row);
        break;

      case 'insertColBefore':
        this.onCommand('table.insertCol', this.tableId, this.position.col, false);
        break;

      case 'insertColAfter':
        this.onCommand('table.insertCol', this.tableId, this.position.col, true);
        break;

      case 'deleteCol':
        this.onCommand('table.deleteCol', this.tableId, this.position.col);
        break;

      case 'mergeCells':
        this.onCommand('table.mergeCells', this.tableId, this.position);
        break;

      case 'splitCell':
        this.onCommand('table.splitCell', this.tableId, this.position);
        break;

      case 'deleteTable':
        this.onCommand('table.delete', this.tableId);
        break;
    }

    this.close();
  }

  /**
   * Handle outside clicks
   */
  private handleOutsideClick(event: MouseEvent): void {
    if (!this.menu.contains(event.target as Node)) {
      this.close();
    }
  }

  /**
   * Handle keyboard navigation
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const items = Array.from(this.menu.querySelectorAll('.notectl-table-menu-item:not([disabled])'));
    const currentIndex = items.findIndex(el => el === document.activeElement);

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < items.length - 1) {
          (items[currentIndex + 1] as HTMLElement).focus();
        } else {
          (items[0] as HTMLElement).focus();
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          (items[currentIndex - 1] as HTMLElement).focus();
        } else {
          (items[items.length - 1] as HTMLElement).focus();
        }
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (currentIndex >= 0) {
          (items[currentIndex] as HTMLElement).click();
        }
        break;
    }
  }

  /**
   * Position menu at coordinates
   */
  public positionAt(x: number, y: number): void {
    this.menu.style.position = 'absolute';
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
  }

  /**
   * Close menu
   */
  public close(): void {
    this.remove();
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    document.removeEventListener('click', this.handleOutsideClick.bind(this));
    this.menu.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Get component styles
   */
  private getStyles(): string {
    return `
      .notectl-table-menu {
        min-width: 200px;
        background: white;
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 4px 0;
        z-index: 1000;
      }

      .notectl-table-menu-item {
        display: block;
        width: 100%;
        padding: 8px 16px;
        border: none;
        background: transparent;
        color: #333;
        text-align: left;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s ease;
      }

      .notectl-table-menu-item:hover:not([disabled]) {
        background: #f5f5f5;
      }

      .notectl-table-menu-item:focus-visible {
        outline: 2px solid #2196f3;
        outline-offset: -2px;
      }

      .notectl-table-menu-item:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .notectl-table-menu-divider {
        height: 1px;
        background: #e0e0e0;
        margin: 4px 0;
      }
    `;
  }
}

// Define custom element
if (!customElements.get('notectl-table-menu')) {
  customElements.define('notectl-table-menu', TableMenu);
}
