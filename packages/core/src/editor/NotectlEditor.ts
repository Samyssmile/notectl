/**
 * NotectlEditor Web Component
 * Framework-agnostic rich text editor
 */

import { EditorState } from '../state/EditorState.js';
import { PluginManager } from '../plugins/PluginManager.js';
import type { Plugin, PluginContext, CommandHandler } from '../plugins/Plugin.js';
import type { Delta } from '../delta/Delta.js';
import type {
  EditorConfig,
  EditorEventCallback,
  Document,
  BlockNode,
  BlockAttrs,
  TextNode,
  Mark,
  EditorEventMap,
  EditorEventKey,
  EditorEventPayload,
  EditorAppearance,
} from '../types/index.js';
import { createDefaultSchema } from '../schema/Schema.js';
import { sanitizeHTML, sanitizeContent, validateDelta } from '../utils/security.js';
import {
  announceToScreenReader,
  registerKeyboardShortcuts,
  setAriaAttributes,
  type KeyboardShortcut
} from '../utils/accessibility.js';
import { EventEmitter } from '../utils/EventEmitter.js';
import { fontRegistry } from '../fonts/FontRegistry.js';

type ParsedNode =
  | { kind: 'block'; node: BlockNode }
  | { kind: 'inline'; nodes: TextNode[] };

type TableRowData = {
  id: string;
  cells: TableCellData[];
  attrs?: Record<string, unknown>;
};

type TableCellData = {
  id: string;
  rowSpan?: number;
  colSpan?: number;
  attrs?: Record<string, unknown>;
  content?: BlockNode[];
};

/**
 * NotectlEditor custom element
 */
export class NotectlEditor extends HTMLElement {
  private state: EditorState;
  private pluginManager: PluginManager;
  private events: EventEmitter<EditorEventMap>;
  private commands: Map<string, CommandHandler> = new Map();
  private contentElement: HTMLDivElement | null = null;
  private pluginContainerTop: HTMLDivElement | null = null;
  private pluginContainerBottom: HTMLDivElement | null = null;
  private config: EditorConfig;
  private keyboardShortcutCleanup?: () => void;
  private ariaLiveRegion: HTMLDivElement | null = null;

  // Plugin queue system for pre-mount registration
  private pendingPlugins: Plugin[] = [];
  private readyPromise: Promise<void>;
  private readyResolve?: () => void;
  private isReady: boolean = false;

  constructor() {
    super();

    // Default config
    this.config = {
      placeholder: 'Start typing...',
      readonly: false,
      autofocus: false,
      sanitizeHTML: true,
      maxHistoryDepth: 100,
      appearance: undefined,
      fonts: undefined,
    };

    // Initialize state
    const schema = createDefaultSchema();
    this.state = new EditorState(undefined, schema, {
      maxHistoryDepth: this.config.maxHistoryDepth,
    });

    // Initialize plugin manager
    this.pluginManager = new PluginManager();

    // Initialize type-safe event emitter
    this.events = new EventEmitter<EditorEventMap>();

    // Initialize ready promise
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    // Attach shadow DOM
    this.attachShadow({ mode: 'open' });
  }

  /**
   * Observed attributes for the web component
   */
  static get observedAttributes(): string[] {
    return ['placeholder', 'readonly', 'autofocus'];
  }

  /**
   * Called when element is connected to DOM
   */
  async connectedCallback(): Promise<void> {
    this.render();
    this.applyAppearance();
    this.attachEventListeners();
    this.setupAccessibility();
    this.setupKeyboardShortcuts();

    // Mark editor as ready
    this.isReady = true;

    // Process pending plugins that were registered before mounting
    if (this.pendingPlugins.length > 0) {
      const plugins = [...this.pendingPlugins];
      this.pendingPlugins = [];

      for (const plugin of plugins) {
        try {
          await this.pluginManager.register(plugin, this.createPluginContext());
        } catch (error) {
          console.error(`Failed to register pending plugin ${plugin.id}:`, error);
        }
      }
    }

    // Resolve the ready promise
    if (this.readyResolve) {
      this.readyResolve();
    }

    // Emit ready event
    this.emit('ready', { editor: this });

    if (this.config.autofocus) {
      this.focus();
    }
  }

  /**
   * Called when element is disconnected from DOM
   */
  disconnectedCallback(): void {
    this.detachEventListeners();
    this.pluginManager.destroyAll();
    if (this.keyboardShortcutCleanup) {
      this.keyboardShortcutCleanup();
    }
    if (this.ariaLiveRegion && this.ariaLiveRegion.parentNode) {
      this.ariaLiveRegion.parentNode.removeChild(this.ariaLiveRegion);
    }

    // Reset ready state for potential re-mounting
    this.isReady = false;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Called when attributes change
   */
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'placeholder':
        this.config.placeholder = newValue || '';
        this.updatePlaceholder();
        break;
      case 'readonly':
        this.config.readonly = newValue !== null;
        this.updateReadonly();
        break;
      case 'autofocus':
        this.config.autofocus = newValue !== null;
        break;
    }
  }

  /**
   * Render the editor UI
   */
  private render(): void {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          font-family: var(--notectl-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          font-size: var(--notectl-font-size, 16px);
          line-height: 1.5;
        }

        .notectl-container {
          display: flex;
          flex-direction: column;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          background: white;
        }

        .notectl-plugin-container {
          display: block;
          background: transparent;
        }

        .notectl-plugin-container[data-position="top"] {
          order: -1;
        }

        .notectl-plugin-container[data-position="bottom"] {
          order: 1;
        }

        .notectl-editor-wrapper {
          position: relative;
          flex: 1;
        }

        .notectl-editor {
          min-height: 200px;
          padding: 1rem;
          outline: none;
          background: white;
        }

        .notectl-container:focus-within {
          border-color: #2196F3;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
        }

        .notectl-editor[data-readonly="true"] {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .notectl-editor table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }

        .notectl-editor table td,
        .notectl-editor table th {
          border: 1px solid #ddd;
          padding: 8px;
          min-width: 100px;
        }

        .notectl-placeholder {
          position: absolute;
          top: 1rem;
          left: 1rem;
          color: #9e9e9e;
          pointer-events: none;
          user-select: none;
        }

        .notectl-placeholder.hidden {
          display: none;
        }

        .visually-hidden {
          position: absolute;
          left: -10000px;
          width: 1px;
          height: 1px;
          overflow: hidden;
        }
      </style>

      <div class="notectl-container">
        <div class="notectl-plugin-container" data-position="top"></div>
        <div class="notectl-editor-wrapper">
          <div class="notectl-placeholder" aria-hidden="true">${this.config.placeholder}</div>
          <div
            class="notectl-editor"
            contenteditable="${!this.config.readonly}"
            data-readonly="${this.config.readonly}"
            role="textbox"
            aria-label="Rich text editor"
            aria-multiline="true"
            aria-describedby="notectl-help-text"
            tabindex="0"
          ></div>
        </div>
        <div class="notectl-plugin-container" data-position="bottom"></div>
      </div>
      <div id="notectl-help-text" class="visually-hidden">
        Use arrow keys to navigate. Press Ctrl+B for bold, Ctrl+I for italic, Ctrl+U for underline.
        Press Ctrl+Z to undo, Ctrl+Shift+Z to redo.
      </div>
      <div id="notectl-aria-live" role="status" aria-live="polite" aria-atomic="true" class="visually-hidden"></div>
    `;

    this.contentElement = this.shadowRoot.querySelector('.notectl-editor');
    this.pluginContainerTop = this.shadowRoot.querySelector('.notectl-plugin-container[data-position="top"]');
    this.pluginContainerBottom = this.shadowRoot.querySelector('.notectl-plugin-container[data-position="bottom"]');
    this.ariaLiveRegion = this.shadowRoot.querySelector('#notectl-aria-live');
    this.renderContent();
  }

  /**
   * Render document content
   */
  private renderContent(): void {
    if (!this.contentElement) return;

    const doc = this.state.getDocument();
    const html = this.documentToHTML(doc);

    // Sanitize HTML before rendering
    this.contentElement.innerHTML = this.config.sanitizeHTML
      ? sanitizeHTML(html)
      : html;

    this.updatePlaceholder();
  }

  /**
   * Convert document to HTML
   */
  private documentToHTML(doc: Document): string {
    return doc.children.map((block) => this.blockToHTML(block)).join('');
  }

  /**
   * Convert block to HTML (simplified)
   */
  private blockToHTML(block: any): string {
    switch (block.type) {
      case 'paragraph':
        return `<p>${this.childrenToHTML(block.children || [])}</p>`;
      case 'heading':
        const level = block.attrs?.level || 1;
        return `<h${level}>${this.childrenToHTML(block.children || [])}</h${level}>`;
      case 'list':
        return this.listToHTML(block);
      case 'list_item':
        return this.listItemToHTML(block);
      case 'table':
        return this.tableToHTML(block);
      default:
        return `<div>${this.childrenToHTML(block.children || [])}</div>`;
    }
  }

  /**
   * Convert children to HTML
   */
  private childrenToHTML(children: any[]): string {
    return children
      .map((child) => {
        if (child.type === 'text') {
          let html = this.escapeHTML(child.text);
          if (child.marks) {
            for (const mark of child.marks) {
              html = this.applyMarkHTML(html, mark);
            }
          }
          return html;
        }
        return this.blockToHTML(child);
      })
      .join('');
  }

  /**
   * Apply mark as HTML
   */
  private applyMarkHTML(text: string, mark: any): string {
    switch (mark.type) {
      case 'bold':
        return `<strong>${text}</strong>`;
      case 'italic':
        return `<em>${text}</em>`;
      case 'underline':
        return `<u>${text}</u>`;
      case 'strikethrough':
        return `<s>${text}</s>`;
      case 'code':
        return `<code>${text}</code>`;
      default:
        return text;
    }
  }

  /**
   * Escape HTML
   */
  private escapeHTML(text: string): string {
    if (!this.config.sanitizeHTML) return text;

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private listToHTML(block: BlockNode): string {
    const tag = block.attrs?.listType === 'ordered' ? 'ol' : 'ul';
    const items = Array.isArray(block.children) ? block.children : [];
    const content = items.map((child) => this.blockToHTML(child)).join('');
    return `<${tag}>${content}</${tag}>`;
  }

  private listItemToHTML(block: BlockNode): string {
    return `<li>${this.childrenToHTML(block.children || [])}</li>`;
  }

  private tableToHTML(block: any): string {
    const tableData = block.attrs?.table;
    const tableId = block.id || crypto.randomUUID();
    const attrParts: string[] = [
      'data-node-type="table"',
      `data-block-id="${tableId}"`,
    ];

    if (block.attrs?.style) {
      const styleString = this.styleObjectToString(block.attrs.style);
      if (styleString) {
        attrParts.push(`style="${styleString}"`);
      }
    }

    let bodyHTML = '';
    const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];

    if (rows.length === 0) {
      const fallbackCellId = crypto.randomUUID();
      const fallbackRowId = crypto.randomUUID();
      bodyHTML = `
        <tr data-node-type="table_row" data-row="0" data-block-id="${fallbackRowId}">
          <td data-node-type="table_cell" data-row="0" data-col="0" data-block-id="${fallbackCellId}"><br></td>
        </tr>
      `;
    } else {
      bodyHTML = rows
        .map((row: any, rowIndex: number) => this.tableRowToHTML(row, rowIndex))
        .join('');
    }

    return `<table ${attrParts.join(' ')}><tbody>${bodyHTML}</tbody></table>`;
  }

  private tableRowToHTML(row: any, rowIndex: number): string {
    const rowId = row.id || crypto.randomUUID();
    const attrs: string[] = [
      'data-node-type="table_row"',
      `data-row="${rowIndex}"`,
      `data-block-id="${rowId}"`,
    ];

    if (row.attrs?.style) {
      const style = this.styleObjectToString(row.attrs.style);
      if (style) {
        attrs.push(`style="${style}"`);
      }
    }

    const cells = Array.isArray(row.cells) ? row.cells : [];

    const cellsHTML = cells
      .map((cell: any, colIndex: number) => this.tableCellToHTML(cell, rowIndex, colIndex))
      .join('');

    return `<tr ${attrs.join(' ')}>${cellsHTML}</tr>`;
  }

  private tableCellToHTML(cell: any, rowIndex: number, colIndex: number): string {
    const cellId = cell.id || crypto.randomUUID();
    const attrs: string[] = [
      'data-node-type="table_cell"',
      `data-row="${rowIndex}"`,
      `data-col="${colIndex}"`,
      `data-block-id="${cellId}"`,
    ];

    const rowSpan = Number(cell.rowSpan) || 1;
    const colSpan = Number(cell.colSpan) || 1;
    if (rowSpan > 1) {
      attrs.push(`rowspan="${rowSpan}"`);
    }
    if (colSpan > 1) {
      attrs.push(`colspan="${colSpan}"`);
    }

    if (cell.attrs?.style) {
      const style = this.styleObjectToString(cell.attrs.style);
      if (style) {
        attrs.push(`style="${style}"`);
      }
    }

    const inner = this.renderCellContent(cell);

    return `<td ${attrs.join(' ')}>${inner}</td>`;
  }

  private styleObjectToString(style: Record<string, unknown>): string {
    return Object.entries(style)
      .map(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          return null;
        }
        const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
        return `${cssKey}: ${String(value)}`;
      })
      .filter(Boolean)
      .join('; ');
  }

  private styleStringToObject(style: string | null): Record<string, string> | undefined {
    if (!style) {
      return undefined;
    }

    const entries = style
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const [property, ...valueParts] = declaration.split(':');
        if (!property || valueParts.length === 0) {
          return null;
        }
        const value = valueParts.join(':').trim();
        if (!value) {
          return null;
        }
        const camelKey = property
          .trim()
          .toLowerCase()
          .replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
        return [camelKey, value] as [string, string];
      })
      .filter(Boolean) as [string, string][];

    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries);
  }

  private renderCellContent(cell: { content?: unknown }): string {
    if (Array.isArray(cell.content) && cell.content.length > 0) {
      return cell.content
        .map((block: BlockNode) => this.blockToHTML(block))
        .join('');
    }

    if (typeof cell.content === 'string') {
      const text = cell.content.trim();
      if (text.length > 0) {
        return this.escapeHTML(text);
      }
    }

    return '<br>';
  }

  /**
   * Setup accessibility features
   */
  private setupAccessibility(): void {
    if (!this.contentElement) return;

    // Set comprehensive ARIA attributes
    setAriaAttributes(this.contentElement, {
      'role': 'textbox',
      'aria-multiline': true,
      'aria-label': 'Rich text editor',
      'aria-describedby': 'notectl-help-text',
      'aria-autocomplete': 'none'
    });

    // Update ARIA attributes based on readonly state
    if (this.config.readonly) {
      this.contentElement.setAttribute('aria-readonly', 'true');
    }
  }

  /**
   * Setup keyboard shortcuts with screen reader announcements
   */
  private setupKeyboardShortcuts(): void {
    if (!this.contentElement) return;

    const shortcuts: KeyboardShortcut[] = [
      {
        key: 'b',
        ctrlKey: true,
        description: 'Bold formatting applied',
        action: () => this.toggleFormat('bold')
      },
      {
        key: 'i',
        ctrlKey: true,
        description: 'Italic formatting applied',
        action: () => this.toggleFormat('italic')
      },
      {
        key: 'u',
        ctrlKey: true,
        description: 'Underline formatting applied',
        action: () => this.toggleFormat('underline')
      },
      {
        key: 'z',
        ctrlKey: true,
        description: 'Action undone',
        action: () => this.undo()
      },
      {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        description: 'Action redone',
        action: () => this.redo()
      }
    ];

    this.keyboardShortcutCleanup = registerKeyboardShortcuts(shortcuts, this.contentElement);
  }

  /**
   * Toggle formatting
   */
  private toggleFormat(format: string): void {
    // Get current selection
    const selection = window.getSelection();
    if (!selection || !this.contentElement) return;

    // Apply formatting via execCommand (will be replaced with Delta operations)
    try {
      switch (format) {
        case 'bold':
          document.execCommand('bold', false);
          break;
        case 'italic':
          document.execCommand('italic', false);
          break;
        case 'underline':
          document.execCommand('underline', false);
          break;
        case 'strikethrough':
          document.execCommand('strikeThrough', false);
          break;
        case 'code':
          // Wrap selection in <code> tag
          const code = document.createElement('code');
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            code.appendChild(range.extractContents());
            range.insertNode(code);
          }
          break;
      }

      this.announceToScreenReader(`${format} formatting applied`);
      this.emit('change', { state: this.state });
    } catch (error) {
      console.error(`Failed to apply ${format} formatting:`, error);
      this.announceToScreenReader(`Failed to apply ${format} formatting`);
    }
  }

  /**
   * Insert table at current selection
   */
  insertTable(rows: number = 3, cols: number = 3): void {
    if (!this.contentElement) return;

    try {
      // Focus the editor if not already focused
      this.contentElement.focus();

      // Create table element
      const table = document.createElement('table');
      table.setAttribute('data-notectl-table', 'true');

      // Create tbody
      const tbody = document.createElement('tbody');

      // Generate rows - all cells are equal, user can style as needed
      for (let i = 0; i < rows; i++) {
        const tr = document.createElement('tr');

        for (let j = 0; j < cols; j++) {
          const cell = document.createElement('td');
          cell.textContent = ''; // Empty cells - user fills them
          tr.appendChild(cell);
        }

        tbody.appendChild(tr);
      }

      table.appendChild(tbody);

      // Get the current selection
      const selection = window.getSelection();
      let insertPosition = this.contentElement.childNodes.length;

      // Try to find the cursor position
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Check if the range is inside contentElement
        if (this.contentElement.contains(range.commonAncestorContainer)) {
          // Find the position in childNodes
          let node = range.startContainer;

          // If it's a text node, get its parent
          if (node.nodeType === Node.TEXT_NODE) {
            node = node.parentNode as Node;
          }

          // Find position among contentElement's children
          if (node === this.contentElement) {
            insertPosition = range.startOffset;
          } else {
            // Find the index of the node or its ancestor
            let child = node;
            while (child.parentNode && child.parentNode !== this.contentElement) {
              child = child.parentNode;
            }
            if (child.parentNode === this.contentElement) {
              insertPosition = Array.from(this.contentElement.childNodes).indexOf(child as ChildNode) + 1;
            }
          }
        }
      }

      // Add a paragraph after the table
      const p = document.createElement('p');
      p.innerHTML = '<br>';

      // Insert at the correct position
      if (insertPosition >= this.contentElement.childNodes.length) {
        this.contentElement.appendChild(table);
        this.contentElement.appendChild(p);
      } else {
        const refNode = this.contentElement.childNodes[insertPosition];
        this.contentElement.insertBefore(table, refNode);
        this.contentElement.insertBefore(p, refNode);
      }

      // Set cursor in the new paragraph
      if (selection) {
        const range = document.createRange();
        range.setStart(p, 0);
        range.setEnd(p, 0);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // Update placeholder visibility (content is no longer empty)
      this.updatePlaceholder();

      // Force sync to state
      this.syncContentToState();

      this.announceToScreenReader(`Table with ${rows} rows and ${cols} columns inserted`);
      this.emit('change', { state: this.state });
    } catch (error) {
      console.error('Failed to insert table:', error);
      this.announceToScreenReader('Failed to insert table');
    }
  }

  /**
   * Announce message to screen readers
   */
  private announceToScreenReader(message: string): void {
    if (this.ariaLiveRegion) {
      this.ariaLiveRegion.textContent = '';
      setTimeout(() => {
        if (this.ariaLiveRegion) {
          this.ariaLiveRegion.textContent = message;
        }
      }, 100);
    } else {
      announceToScreenReader(message);
    }
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (!this.contentElement) return;

    this.contentElement.addEventListener('input', this.handleInput);
    this.contentElement.addEventListener('keydown', this.handleKeydown);
    this.contentElement.addEventListener('focus', this.handleFocus);
    this.contentElement.addEventListener('blur', this.handleBlur);
    this.contentElement.addEventListener('contextmenu', this.handleContextMenu);
  }

  /**
   * Detach event listeners
   */
  private detachEventListeners(): void {
    if (!this.contentElement) return;

    this.contentElement.removeEventListener('input', this.handleInput);
    this.contentElement.removeEventListener('keydown', this.handleKeydown);
    this.contentElement.removeEventListener('focus', this.handleFocus);
    this.contentElement.removeEventListener('blur', this.handleBlur);
    this.contentElement.removeEventListener('contextmenu', this.handleContextMenu);
  }

  /**
   * Handle input event
   */
  private handleInput = (_event: Event): void => {
    this.updatePlaceholder();
    this.syncContentToState();
    this.emit('change', { state: this.state });
  };

  /**
   * Handle keydown event
   */
  private handleKeydown = (event: KeyboardEvent): void => {
    this.emit('keydown', event);
    if (event.defaultPrevented) {
      return;
    }

    // Handle undo/redo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.redo();
        this.announceToScreenReader('Action redone');
      } else {
        this.undo();
        this.announceToScreenReader('Action undone');
      }
    }

    // Announce navigation
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      if (event.ctrlKey || event.metaKey) {
        this.announceToScreenReader(`Navigating ${event.key.replace('Arrow', '').toLowerCase()}`);
      }
    }
  };

  /**
   * Handle focus event
   */
  private handleFocus = (): void => {
    this.emit('focus', { state: this.state });
  };

  /**
   * Handle blur event
   */
  private handleBlur = (): void => {
    this.emit('blur', { state: this.state });
  };

  private handleContextMenu = (event: MouseEvent): void => {
    this.emit('contextmenu', event);
  };

  /**
   * Update placeholder visibility
   */
  private updatePlaceholder(): void {
    if (!this.shadowRoot || !this.contentElement) {
      return;
    }

    const placeholder = this.shadowRoot.querySelector('.notectl-placeholder');
    if (!placeholder) {
      return;
    }

    const hasTextContent = Boolean(this.contentElement.textContent?.trim());
    const onlyEmptyParagraphs = this.hasOnlyEmptyParagraphs(this.contentElement);
    const isEmpty = !hasTextContent && onlyEmptyParagraphs;

    placeholder.classList.toggle('hidden', !isEmpty);
  }

  /**
   * Determine if the editor surface only contains empty paragraphs.
   * Empty paragraphs are <p> elements that contain no text nor child elements
   * other than <br>, which is how execCommand represents blank blocks.
   */
  private hasOnlyEmptyParagraphs(root: HTMLElement): boolean {
    const elements = Array.from(root.children);

    if (elements.length === 0) {
      return true;
    }

    return elements.every((element) => {
      if (element.tagName !== 'P') {
        return false;
      }

      return this.isParagraphEmpty(element);
    });
  }

  private isParagraphEmpty(paragraph: Element): boolean {
    const hasText = Boolean(paragraph.textContent?.trim());
    if (hasText) {
      return false;
    }

    const hasNonBreakChild = Array.from(paragraph.children).some(
      (child) => child.tagName !== 'BR'
    );

    return !hasNonBreakChild;
  }

  /**
   * Sync content from DOM to state
   */
  private syncContentToState(): void {
    if (!this.contentElement) return;

    try {
      const doc = this.htmlToDocument(this.contentElement.innerHTML);
      this.state = EditorState.fromJSON(doc, this.state.schema);
    } catch (error) {
      console.error('Failed to sync content to state:', error);
    }
  }

  /**
   * Convert HTML to document structure
   */
  private htmlToDocument(html: string): Document {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;

    const children = this.parseBlockNodes(body.childNodes);

    if (children.length === 0) {
      children.push(this.createParagraphNode());
    }

    return {
      version: this.state.getDocument().version + 1,
      schemaVersion: '1.0.0',
      children,
    };
  }

  /**
   * Convert a list of DOM nodes into block nodes while preserving inline runs.
   */
  private parseBlockNodes(nodes: NodeListOf<ChildNode> | ChildNode[]): BlockNode[] {
    const blocks: BlockNode[] = [];
    let inlineBuffer: TextNode[] = [];

    const flushInlineBuffer = (): void => {
      if (inlineBuffer.length === 0) return;
      const content = inlineBuffer;
      inlineBuffer = [];
      blocks.push(this.createParagraphNode(content));
    };

    Array.from(nodes).forEach((node) => {
      if (this.shouldExtractBlockChildren(node)) {
        flushInlineBuffer();
        const element = node as Element;
        const nestedBlocks = this.parseBlockNodes(element.childNodes);
        if (nestedBlocks.length > 0) {
          blocks.push(...nestedBlocks);
        }
        return;
      }

      const parsed = this.nodeToBlock(node);
      if (!parsed) {
        return;
      }

      if (parsed.kind === 'inline') {
        inlineBuffer.push(...parsed.nodes);
        return;
      }

      flushInlineBuffer();
      blocks.push(parsed.node);
    });

    flushInlineBuffer();
    return blocks;
  }

  /**
   * Create a paragraph node with generated ID
   */
  private createParagraphNode(children: TextNode[] = []): BlockNode {
    return {
      id: crypto.randomUUID(),
      type: 'paragraph',
      children,
    };
  }

  /**
   * Create a list item node with generated ID
   */
  private createListItemNode(children: BlockNode[]): BlockNode {
    return {
      id: crypto.randomUUID(),
      type: 'list_item',
      children,
    };
  }

  /**
   * Convert DOM node to block
   */
  private nodeToBlock(node: Node): ParsedNode | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text.trim()) return null;
      return {
        kind: 'inline',
        nodes: [
          {
            type: 'text',
            text,
            marks: [],
          },
        ],
      };
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      // Block elements
      if (tagName === 'p' || tagName === 'div') {
        return {
          kind: 'block',
          node: this.createParagraphNode(this.parseInlineNodes(element.childNodes)),
        };
      }

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        const level = parseInt(tagName.charAt(1), 10);
        return {
          kind: 'block',
          node: {
            id: crypto.randomUUID(),
            type: 'heading',
            attrs: { level },
            children: this.parseInlineNodes(element.childNodes),
          },
        };
      }

      if (tagName === 'ul' || tagName === 'ol') {
        const listNode = this.parseList(element, tagName === 'ol');
        if (listNode) {
          return { kind: 'block', node: listNode };
        }
        return null;
      }

      if (tagName === 'table') {
        const tableNode = this.parseTable(element);
        if (tableNode) {
          return { kind: 'block', node: tableNode };
        }
        return null;
      }

      // Inline elements - extract text with marks
      const inlineNodes = this.parseInlineElement(element);
      if (inlineNodes.length === 0) {
        return null;
      }
      return { kind: 'inline', nodes: inlineNodes };
    }

    return null;
  }

  /**
   * Parse <ul>/<ol> elements into structured list nodes
   */
  private parseList(element: Element, ordered: boolean): BlockNode | null {
    const items: BlockNode[] = [];

    Array.from(element.children).forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      if (child.tagName.toLowerCase() !== 'li') {
        return;
      }

      const listItem = this.parseListItem(child as Element);
      if (listItem) {
        items.push(listItem);
      }
    });

    if (items.length === 0) {
      items.push(this.createListItemNode([this.createParagraphNode()]));
    }

    return {
      id: crypto.randomUUID(),
      type: 'list',
      attrs: { listType: ordered ? 'ordered' : 'bullet' },
      children: items,
    };
  }

  /**
   * Parse <li> elements into list_item nodes
   */
  private parseListItem(element: Element): BlockNode | null {
    const children = this.parseBlockNodes(element.childNodes);

    if (children.length === 0 || children[0].type !== 'paragraph') {
      children.unshift(this.createParagraphNode());
    }

    return this.createListItemNode(children);
  }

  /**
   * Parse <table> elements into structured table blocks
   */
  private parseTable(element: Element): BlockNode | null {
    const rows = this.parseTableRows(element);
    if (rows.length === 0) {
      return null;
    }

    const tableId = element.getAttribute('data-block-id') || crypto.randomUUID();
    const attrs: BlockAttrs = {
      table: {
        id: tableId,
        rows,
      },
    };

    const style = this.styleStringToObject(element.getAttribute('style'));
    if (style) {
      attrs.style = style;
    }

    return {
      id: tableId,
      type: 'table',
      attrs,
      children: [],
    };
  }

  private parseTableRows(tableElement: Element): TableRowData[] {
    const rows: TableRowData[] = [];
    const rowElements = this.collectTableRowElements(tableElement);

    rowElements.forEach((rowElement) => {
      const row = this.parseTableRow(rowElement);
      if (row && row.cells.length > 0) {
        rows.push(row);
      }
    });

    return rows;
  }

  private collectTableRowElements(tableElement: Element): Element[] {
    const rowElements: Element[] = [];

    const pushRow = (row: Element): void => {
      if (!rowElements.includes(row)) {
        rowElements.push(row);
      }
    };

    Array.from(tableElement.children).forEach((child) => {
      const tagName = child.tagName.toLowerCase();
      if (tagName === 'tr') {
        pushRow(child as Element);
      } else if (['tbody', 'thead', 'tfoot'].includes(tagName)) {
        Array.from(child.children).forEach((row) => {
          if (row.tagName.toLowerCase() === 'tr') {
            pushRow(row as Element);
          }
        });
      }
    });

    if (rowElements.length === 0) {
      tableElement.querySelectorAll('tr').forEach((row) => pushRow(row));
    }

    return rowElements;
  }

  private parseTableRow(rowElement: Element): TableRowData | null {
    const rowId = rowElement.getAttribute('data-block-id') || crypto.randomUUID();
    const cells: TableCellData[] = [];

    Array.from(rowElement.children).forEach((child) => {
      const tagName = child.tagName.toLowerCase();
      if (tagName === 'td' || tagName === 'th') {
        const cell = this.parseTableCell(child as Element);
        if (cell) {
          cells.push(cell);
        }
      }
    });

    const style = this.styleStringToObject(rowElement.getAttribute('style'));
    const attrs = style ? { style } : undefined;

    return {
      id: rowId,
      cells,
      ...(attrs ? { attrs } : {}),
    };
  }

  private parseTableCell(cellElement: Element): TableCellData | null {
    const cellId = cellElement.getAttribute('data-block-id') || crypto.randomUUID();
    const rowSpanAttr = parseInt(cellElement.getAttribute('rowspan') || '1', 10);
    const colSpanAttr = parseInt(cellElement.getAttribute('colspan') || '1', 10);
    const style = this.styleStringToObject(cellElement.getAttribute('style'));
    const contentBlocks = this.parseCellContent(cellElement);

    const cell: TableCellData = { id: cellId };
    if (rowSpanAttr > 1) {
      cell.rowSpan = rowSpanAttr;
    }
    if (colSpanAttr > 1) {
      cell.colSpan = colSpanAttr;
    }
    if (style) {
      cell.attrs = { style };
    }
    if (contentBlocks.length > 0) {
      cell.content = contentBlocks;
    }

    return cell;
  }

  private parseCellContent(element: Element): BlockNode[] {
    const blocks = this.parseBlockNodes(element.childNodes);
    if (blocks.length === 0) {
      return [];
    }
    return blocks;
  }

  /**
   * Parse inline nodes within a block context
   */
  private parseInlineNodes(nodes: NodeListOf<ChildNode> | ChildNode[], marks: Mark[] = []): TextNode[] {
    const children: TextNode[] = [];
    const iterable = Array.isArray(nodes) ? nodes : Array.from(nodes);

    iterable.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (!text) {
          return;
        }
        children.push({
          type: 'text',
          text,
          marks: marks.length > 0 ? this.cloneMarks(marks) : [],
        });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        children.push(...this.parseInlineElement(node as Element, marks));
      }
    });

    return children;
  }

  /**
   * Parse inline element with mark inheritance
   */
  private parseInlineElement(element: Element, inheritedMarks: Mark[] = []): TextNode[] {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'br') {
      return [
        {
          type: 'text',
          text: '\n',
          marks: inheritedMarks.length > 0 ? this.cloneMarks(inheritedMarks) : [],
        },
      ];
    }

    const marks = [...inheritedMarks, ...this.getMarksForElement(element)];
    return this.parseInlineNodes(element.childNodes, marks);
  }

  /**
   * Map HTML elements to editor marks
   */
  private getMarksForElement(element: Element): Mark[] {
    const tagName = element.tagName.toLowerCase();

    switch (tagName) {
      case 'strong':
      case 'b':
        return [{ type: 'bold' }];
      case 'em':
      case 'i':
        return [{ type: 'italic' }];
      case 'u':
        return [{ type: 'underline' }];
      case 's':
      case 'strike':
        return [{ type: 'strikethrough' }];
      case 'code':
        return [{ type: 'code' }];
      case 'a':
        return [
          {
            type: 'link',
            attrs: {
              href: element.getAttribute('href') || '',
              title: element.getAttribute('title') || '',
            },
          },
        ];
      default:
        return [];
    }
  }

  /**
   * Deep clone marks to avoid accidental mutations across nodes
   */
  private cloneMarks(marks: Mark[]): Mark[] {
    return marks.map((mark) => ({
      type: mark.type,
      attrs: mark.attrs ? { ...mark.attrs } : undefined,
    }));
  }

  /**
   * Determine if an element should be treated as a structural container whose
   * children need to be parsed as separate blocks (e.g., a div wrapping an <ol>).
   */
  private shouldExtractBlockChildren(node: ChildNode): node is Element {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    const containerTags = new Set(['div', 'section', 'article', 'blockquote']);
    if (!containerTags.has(tagName)) {
      return false;
    }

    return Array.from(element.childNodes).some((child) => this.isBlockElement(child));
  }

  /**
   * Check whether a child node represents a structural block element.
   */
  private isBlockElement(node: ChildNode): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const blockTags = new Set([
      'p',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'pre',
      'blockquote',
    ]);

    return blockTags.has((node as Element).tagName.toLowerCase());
  }

  /**
   * Update readonly state
   */
  private updateReadonly(): void {
    if (this.contentElement) {
      this.contentElement.contentEditable = String(!this.config.readonly);
      this.contentElement.setAttribute('data-readonly', String(this.config.readonly));
    }
  }

  /**
   * Register a plugin
   *
   * Plugins can be registered before or after the editor is mounted.
   * If registered before mounting, they will be queued and initialized
   * automatically when the editor connects to the DOM.
   *
   * @param plugin - The plugin to register
   * @returns Promise that resolves when the plugin is registered
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    // If editor is not yet connected to DOM, queue the plugin
    if (!this.isReady) {
      this.pendingPlugins.push(plugin);
      return;
    }

    // Editor is ready, register immediately
    const context = this.createPluginContext();
    await this.pluginManager.register(plugin, context);
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
    const context = this.createPluginContext();
    await this.pluginManager.unregister(pluginId, context);
  }

  /**
   * Wait for the editor to be ready
   *
   * Returns a Promise that resolves when the editor has been mounted
   * and all pending plugins have been initialized. This is useful when
   * you need to ensure the editor is fully initialized before performing
   * operations that depend on the editor being mounted.
   *
   * @returns Promise that resolves when the editor is ready
   * @example
   * ```typescript
   * const editor = document.createElement('notectl-editor');
   * container.appendChild(editor);
   * await editor.whenReady();
   * // Editor is now fully initialized
   * ```
   */
  async whenReady(): Promise<void> {
    return this.readyPromise;
  }

  // ===== Plugin Context Helper Methods =====

  /**
   * Get the block containing the current selection
   */
  private getSelectedBlock(): import('../types/index.js').BlockNode | null {
    const selection = this.state.getSelection();
    if (!selection) return null;

    return this.state.findBlock(selection.anchor.blockId) || null;
  }

  /**
   * Find all blocks of a specific type
   */
  private findBlocksByType(type: string): import('../types/index.js').BlockNode[] {
    const results: import('../types/index.js').BlockNode[] = [];
    const doc = this.state.getDocument();

    const search = (nodes: import('../types/index.js').BlockNode[]): void => {
      for (const node of nodes) {
        if (node.type === type) {
          results.push(node);
        }
        if (node.children) {
          const blockChildren = node.children.filter(
            (n): n is import('../types/index.js').BlockNode => 'id' in n
          );
          search(blockChildren);
        }
      }
    };

    search(doc.children);
    return results;
  }

  /**
   * Find parent block of a given block
   */
  private findParentBlock(block: import('../types/index.js').BlockNode): import('../types/index.js').BlockNode | null {
    const doc = this.state.getDocument();

    const search = (
      nodes: import('../types/index.js').BlockNode[],
      parent: import('../types/index.js').BlockNode | null = null
    ): import('../types/index.js').BlockNode | null => {
      for (const node of nodes) {
        if (node.id === block.id) {
          return parent;
        }
        if (node.children) {
          const blockChildren = node.children.filter(
            (n): n is import('../types/index.js').BlockNode => 'id' in n
          );
          const found = search(blockChildren, node);
          if (found) return found;
        }
      }
      return null;
    };

    return search(doc.children);
  }

  /**
   * Get block at current cursor position
   */
  private getBlockAtCursor(): import('../types/index.js').BlockNode | null {
    return this.getSelectedBlock();
  }

  /**
   * Insert a block after another block (Delta-based)
   */
  private insertBlockAfter(block: import('../types/index.js').BlockNode, afterId?: import('../types/index.js').BlockId): void {
    const doc = this.state.getDocument();
    const targetId = afterId || (doc.children[doc.children.length - 1]?.id);

    if (!targetId) {
      // Document is empty, just add the block
      const delta: Delta = {
        txnId: crypto.randomUUID(),
        clientId: 'editor',
        timestamp: new Date().toISOString(),
        baseVersion: this.state.getVersion(),
        ltime: Date.now(),
        intent: 'edit',
        ops: [
          {
            op: 'insert_block_after',
            after: '',
            block,
          },
        ],
      };
      this.applyDelta(delta);
      return;
    }

    const delta: Delta = {
      txnId: crypto.randomUUID(),
      clientId: 'editor',
      timestamp: new Date().toISOString(),
      baseVersion: this.state.getVersion(),
      ltime: Date.now(),
      intent: 'edit',
      ops: [
        {
          op: 'insert_block_after',
          after: targetId,
          block,
        },
      ],
    };

    this.applyDelta(delta);
  }

  /**
   * Insert a block before another block (Delta-based)
   */
  private insertBlockBefore(block: import('../types/index.js').BlockNode, beforeId?: import('../types/index.js').BlockId): void {
    const doc = this.state.getDocument();
    const targetId = beforeId || doc.children[0]?.id;

    if (!targetId) {
      // Document is empty, just add the block
      this.insertBlockAfter(block);
      return;
    }

    const delta: Delta = {
      txnId: crypto.randomUUID(),
      clientId: 'editor',
      timestamp: new Date().toISOString(),
      baseVersion: this.state.getVersion(),
      ltime: Date.now(),
      intent: 'edit',
      ops: [
        {
          op: 'insert_block_before',
          before: targetId,
          block,
        },
      ],
    };

    this.applyDelta(delta);
  }

  /**
   * Update block attributes (Delta-based)
   */
  private updateBlockAttrs(blockId: import('../types/index.js').BlockId, attrs: Record<string, unknown>): void {
    const delta: Delta = {
      txnId: crypto.randomUUID(),
      clientId: 'editor',
      timestamp: new Date().toISOString(),
      baseVersion: this.state.getVersion(),
      ltime: Date.now(),
      intent: 'edit',
      ops: [
        {
          op: 'set_attrs',
          target: { blockId },
          attrs,
        },
      ],
    };

    this.applyDelta(delta);
  }

  /**
   * Delete a block (Delta-based)
   */
  private deleteBlockById(blockId: import('../types/index.js').BlockId): void {
    const delta: Delta = {
      txnId: crypto.randomUUID(),
      clientId: 'editor',
      timestamp: new Date().toISOString(),
      baseVersion: this.state.getVersion(),
      ltime: Date.now(),
      intent: 'edit',
      ops: [
        {
          op: 'delete_block',
          target: { blockId },
        },
      ],
    };

    this.applyDelta(delta);
  }

  /**
   * Add mark to current selection (Delta-based)
   */
  private addMarkToSelection(mark: import('../types/index.js').Mark): void {
    const selection = this.state.getSelection();
    if (!selection) return;

    const delta: Delta = {
      txnId: crypto.randomUUID(),
      clientId: 'editor',
      timestamp: new Date().toISOString(),
      baseVersion: this.state.getVersion(),
      ltime: Date.now(),
      intent: 'format',
      ops: [
        {
          op: 'apply_mark',
          range: {
            start: selection.anchor,
            end: selection.head,
          },
          mark,
          add: true,
        },
      ],
    };

    this.applyDelta(delta);
  }

  /**
   * Remove mark from current selection (Delta-based)
   */
  private removeMarkFromSelection(markType: string): void {
    const selection = this.state.getSelection();
    if (!selection) return;

    const delta: Delta = {
      txnId: crypto.randomUUID(),
      clientId: 'editor',
      timestamp: new Date().toISOString(),
      baseVersion: this.state.getVersion(),
      ltime: Date.now(),
      intent: 'format',
      ops: [
        {
          op: 'apply_mark',
          range: {
            start: selection.anchor,
            end: selection.head,
          },
          mark: { type: markType },
          add: false,
        },
      ],
    };

    this.applyDelta(delta);
  }

  /**
   * Toggle mark on current selection (Delta-based)
   */
  private toggleMarkOnSelection(markType: string): void {
    const selection = this.state.getSelection();
    if (!selection) return;

    const block = this.state.findBlock(selection.anchor.blockId);
    if (!block || !block.children) return;

    // Check if mark already exists in selection
    const textNode = block.children.find((n): n is import('../types/index.js').TextNode => 'text' in n);
    const hasMark = textNode?.marks?.some((m) => m.type === markType) || false;

    const delta: Delta = {
      txnId: crypto.randomUUID(),
      clientId: 'editor',
      timestamp: new Date().toISOString(),
      baseVersion: this.state.getVersion(),
      ltime: Date.now(),
      intent: 'format',
      ops: [
        {
          op: 'apply_mark',
          range: {
            start: selection.anchor,
            end: selection.head,
          },
          mark: { type: markType },
          add: !hasMark,
        },
      ],
    };

    this.applyDelta(delta);
  }

  /**
   * Create plugin context
   */
  private createPluginContext(): PluginContext {
    return {
      // Core state and delta operations
      getState: () => this.state,
      applyDelta: (delta: Delta) => this.applyDelta(delta),

      // Selection helpers
      getSelection: () => this.state.getSelection(),
      setSelection: (selection) => {
        this.state.setSelection(selection);
        this.emit('selection-change', { selection });
      },
      getSelectedBlock: () => this.getSelectedBlock(),

      // Node queries
      findBlocksByType: (type: string) => this.findBlocksByType(type),
      findBlockById: (blockId) => this.state.findBlock(blockId),
      findParentBlock: (block) => this.findParentBlock(block),
      getBlockAtCursor: () => this.getBlockAtCursor(),

      // Block mutations
      insertBlockAfter: (block, afterId) => this.insertBlockAfter(block, afterId),
      insertBlockBefore: (block, beforeId) => this.insertBlockBefore(block, beforeId),
      updateBlockAttrs: (blockId, attrs) => this.updateBlockAttrs(blockId, attrs),
      deleteBlock: (blockId) => this.deleteBlockById(blockId),

      // Mark utilities
      addMark: (mark) => this.addMarkToSelection(mark),
      removeMark: (markType) => this.removeMarkFromSelection(markType),
      toggleMark: (markType) => this.toggleMarkOnSelection(markType),

      // Events - Type-safe event handling for plugins
      on: <K extends EditorEventKey>(event: K, callback: EditorEventCallback<EditorEventPayload<K>>) =>
        this.on(event, callback),
      off: <K extends EditorEventKey>(event: K, callback: EditorEventCallback<EditorEventPayload<K>>) =>
        this.off(event, callback),
      emit: <K extends EditorEventKey>(event: K, data?: EditorEventPayload<K>) =>
        this.emit(event, data as EditorEventPayload<K>),

      // Commands
      registerCommand: (name: string, handler: CommandHandler) => this.registerCommand(name, handler),
      executeCommand: (name: string, ...args: unknown[]) => this.executeCommand(name, ...args),

      // DOM access (deprecated)
      getContainer: () => this.contentElement!,
      getPluginContainer: (position: 'top' | 'bottom') => {
        if (position === 'top') {
          return this.pluginContainerTop!;
        }
        return this.pluginContainerBottom!;
      },
    };
  }

  /**
   * Apply a delta
   */
  applyDelta(delta: Delta): void {
    // Validate delta for security
    if (!validateDelta(delta)) {
      console.error('Invalid or unsafe delta rejected');
      this.announceToScreenReader('Action blocked due to security validation');
      return;
    }

    this.state.applyDelta(delta);
    this.renderContent();
    this.pluginManager.notifyDeltaApplied(delta);
    this.emit('change', { delta, state: this.state });
  }

  /**
   * Register event listener with type-safe payload inference
   * @param event - Event name (autocomplete for known events)
   * @param callback - Callback function with typed payload
   */
  on<K extends EditorEventKey>(
    event: K,
    callback: EditorEventCallback<EditorEventPayload<K>>
  ): void {
    // Type assertion is safe here because EventEmitter accepts any callback signature
    this.events.on(event as keyof EditorEventMap, callback as never);
  }

  /**
   * Unregister event listener
   * @param event - Event name
   * @param callback - Callback function to remove
   */
  off<K extends EditorEventKey>(
    event: K,
    callback: EditorEventCallback<EditorEventPayload<K>>
  ): void {
    // Type assertion is safe here because EventEmitter accepts any callback signature
    this.events.off(event as keyof EditorEventMap, callback as never);
  }

  /**
   * Emit event (internal use)
   * @param event - Event name
   * @param data - Event payload
   */
  private emit<K extends EditorEventKey>(
    event: K,
    data: EditorEventPayload<K>
  ): void {
    this.events.emit(event, data);
  }

  /**
   * Register command
   */
  registerCommand(name: string, handler: CommandHandler): void {
    this.commands.set(name, handler);
  }

  /**
   * Execute command
   */
  executeCommand(name: string, ...args: unknown[]): unknown {
    const handler = this.commands.get(name);
    if (!handler) {
      throw new Error(`Command not found: ${name}`);
    }
    return handler(...args);
  }

  /**
   * Undo last change
   */
  undo(): void {
    const undoDelta = this.state.undo();
    if (undoDelta) {
      this.renderContent();
      this.announceToScreenReader('Undo performed');
      this.emit('change', { delta: undoDelta, state: this.state });
    } else {
      this.announceToScreenReader('Nothing to undo');
    }
  }

  /**
   * Redo last undone change
   */
  redo(): void {
    const redoDelta = this.state.redo();
    if (redoDelta) {
      this.renderContent();
      this.announceToScreenReader('Redo performed');
      this.emit('change', { delta: redoDelta, state: this.state });
    } else {
      this.announceToScreenReader('Nothing to redo');
    }
  }

  /**
   * Configure editor options
   * @param config - Configuration options to apply
   */
  configure(config: Partial<EditorConfig>): void {
    const mergedAppearance = this.mergeAppearance(config.appearance);
    this.config = {
      ...this.config,
      ...config,
      appearance: mergedAppearance,
    };

    if (config.fonts) {
      fontRegistry.register(config.fonts);
    }

    this.applyAppearance();

    // Apply configuration changes
    if (config.readonly !== undefined) {
      this.updateReadonly();
    }

    if (config.placeholder !== undefined && this.shadowRoot) {
      const placeholder = this.shadowRoot.querySelector('.notectl-placeholder');
      if (placeholder) {
        placeholder.textContent = config.placeholder;
      }
    }

    if (config.initialContent) {
      if (typeof config.initialContent === 'object') {
        this.setJSON(config.initialContent);
      }
    }

    if (config.content) {
      if (typeof config.content === 'string') {
        this.setContent(config.content);
      } else {
        this.setJSON(config.content as Document);
      }
    }
  }

  private mergeAppearance(next?: Partial<EditorAppearance>): EditorAppearance | undefined {
    if (!next) {
      return this.config.appearance;
    }

    const current = this.config.appearance ?? {};
    const merged: EditorAppearance = {
      ...current,
      ...next,
    };

    return this.hasAppearanceValue(merged) ? merged : undefined;
  }

  private applyAppearance(): void {
    const appearance = this.config.appearance;
    this.setAppearanceProperty('--notectl-font-family', appearance?.fontFamily ?? undefined);
    this.setAppearanceProperty('--notectl-font-size', this.normalizeFontSize(appearance?.fontSize));
  }

  private setAppearanceProperty(name: string, value?: string): void {
    if (value && value.trim().length > 0) {
      this.style.setProperty(name, value);
      return;
    }

    this.style.removeProperty(name);
  }

  private normalizeFontSize(fontSize?: string | number | null): string | undefined {
    if (fontSize === undefined || fontSize === null) {
      return undefined;
    }

    if (typeof fontSize === 'number' && !Number.isNaN(fontSize)) {
      return `${fontSize}px`;
    }

    const value = fontSize.toString().trim();
    return value.length > 0 ? value : undefined;
  }

  private hasAppearanceValue(appearance?: EditorAppearance | null): boolean {
    if (!appearance) {
      return false;
    }

    const hasFontFamily =
      appearance.fontFamily !== undefined && appearance.fontFamily !== null && appearance.fontFamily !== '';
    const hasFontSize =
      appearance.fontSize !== undefined && appearance.fontSize !== null && appearance.fontSize !== '';

    return hasFontFamily || hasFontSize;
  }

  /**
   * Destroy the editor and clean up resources
   */
  destroy(): void {
    this.detachEventListeners();
    this.pluginManager.destroyAll();

    if (this.keyboardShortcutCleanup) {
      this.keyboardShortcutCleanup();
    }

    if (this.ariaLiveRegion && this.ariaLiveRegion.parentNode) {
      this.ariaLiveRegion.parentNode.removeChild(this.ariaLiveRegion);
    }

    this.events.removeAllListeners();
    this.commands.clear();
  }

  /**
   * Get current content as string or JSON
   * @returns Current document content
   */
  getContent(): Document | string {
    return this.getJSON();
  }

  /**
   * Get current state
   */
  getState(): EditorState {
    return this.state;
  }

  /**
   * Get document as JSON
   */
  getJSON(): Document {
    return this.state.toJSON();
  }

  /**
   * Set document from JSON
   */
  setJSON(doc: Document): void {
    this.state = EditorState.fromJSON(doc, this.state.schema);
    this.renderContent();
  }

  /**
   * Get HTML content (sanitized)
   */
  getHTML(): string {
    const html = this.documentToHTML(this.state.getDocument());
    return this.config.sanitizeHTML ? sanitizeHTML(html) : html;
  }

  /**
   * Set HTML content (with sanitization)
   * @param html - HTML content to set
   */
  setHTML(html: string): void {
    const sanitized = this.config.sanitizeHTML ? sanitizeHTML(html) : html;
    if (this.contentElement) {
      this.contentElement.innerHTML = sanitized;
      this.updatePlaceholder();
      this.announceToScreenReader('Content updated');
    }
  }

  /**
   * Set content from string (with sanitization)
   * @param content - Content to set
   * @param allowHTML - Allow HTML tags
   */
  setContent(content: string, allowHTML: boolean = true): void {
    const sanitized = this.config.sanitizeHTML
      ? sanitizeContent(content, allowHTML)
      : content;

    if (this.contentElement) {
      this.contentElement.innerHTML = sanitized;
      this.updatePlaceholder();
      this.announceToScreenReader('Content updated');
    }
  }

  /**
   * Export HTML content (sanitized)
   * @returns Sanitized HTML
   */
  exportHTML(): string {
    return this.getHTML();
  }

  /**
   * Focus the editor
   */
  focus(): void {
    this.contentElement?.focus();
  }

  /**
   * Blur the editor
   */
  blur(): void {
    this.contentElement?.blur();
  }
}

/**
 * Register custom element
 */
if (!customElements.get('notectl-editor')) {
  customElements.define('notectl-editor', NotectlEditor);
}
