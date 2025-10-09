/**
 * NotectlEditor Web Component
 * Framework-agnostic rich text editor
 */

import { EditorState } from '../state/EditorState.js';
import { PluginManager } from '../plugins/PluginManager.js';
import type { Plugin, PluginContext, CommandHandler } from '../plugins/Plugin.js';
import type { Delta } from '../delta/Delta.js';
import type { EditorConfig, EditorEvent, EditorEventCallback, Document } from '../types/index.js';
import { createDefaultSchema } from '../schema/Schema.js';
import { sanitizeHTML, sanitizeContent, validateDelta } from '../utils/security.js';
import {
  announceToScreenReader,
  registerKeyboardShortcuts,
  setAriaAttributes,
  type KeyboardShortcut
} from '../utils/accessibility.js';

/**
 * NotectlEditor custom element
 */
export class NotectlEditor extends HTMLElement {
  private state: EditorState;
  private pluginManager: PluginManager;
  private eventListeners: Map<string, Set<EditorEventCallback>> = new Map();
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
    };

    // Initialize state
    const schema = createDefaultSchema();
    this.state = new EditorState(undefined, schema, {
      maxHistoryDepth: this.config.maxHistoryDepth,
    });

    // Initialize plugin manager
    this.pluginManager = new PluginManager();

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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 16px;
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

    const content = typeof cell.content === 'string' ? this.escapeHTML(cell.content) : '';
    const inner = content || '<br>';

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
  private handleInput = (event: Event): void => {
    this.updatePlaceholder();

    // Skip syncing if input originates inside a managed table to avoid
    // clobbering the plugin-driven document state until table syncing is
    // fully implemented.
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-node-type="table"]')) {
      this.syncContentToState();
    }

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
    if (!this.shadowRoot) return;

    const placeholder = this.shadowRoot.querySelector('.notectl-placeholder');
    const isEmpty = !this.contentElement?.textContent?.trim();

    if (placeholder) {
      placeholder.classList.toggle('hidden', !isEmpty);
    }
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

    const children: any[] = [];

    // Parse child nodes
    Array.from(body.childNodes).forEach((node) => {
      const block = this.nodeToBlock(node);
      if (block) {
        children.push(block);
      }
    });

    // If no children, create empty paragraph
    if (children.length === 0) {
      children.push({
        id: crypto.randomUUID(),
        type: 'paragraph',
        children: [],
      });
    }

    return {
      version: this.state.getDocument().version + 1,
      schemaVersion: '1.0.0',
      children,
    };
  }

  /**
   * Convert DOM node to block
   */
  private nodeToBlock(node: Node): any {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text.trim()) return null;
      return {
        type: 'text',
        text,
        marks: [],
      };
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      // Block elements
      if (tagName === 'p') {
        return {
          id: crypto.randomUUID(),
          type: 'paragraph',
          children: this.parseChildren(element),
        };
      }

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        const level = parseInt(tagName.charAt(1), 10);
        return {
          id: crypto.randomUUID(),
          type: 'heading',
          attrs: { level },
          children: this.parseChildren(element),
        };
      }

      // Inline elements - extract text with marks
      return this.parseInlineElement(element);
    }

    return null;
  }

  /**
   * Parse children nodes
   */
  private parseChildren(element: Element): any[] {
    const children: any[] = [];

    Array.from(element.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          children.push({
            type: 'text',
            text,
            marks: [],
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const childElement = node as Element;
        const result = this.parseInlineElement(childElement);
        if (result) {
          if (Array.isArray(result)) {
            children.push(...result);
          } else {
            children.push(result);
          }
        }
      }
    });

    return children;
  }

  /**
   * Parse inline element with marks
   */
  private parseInlineElement(element: Element): any {
    const tagName = element.tagName.toLowerCase();
    const marks: any[] = [];

    // Determine mark type
    if (tagName === 'strong' || tagName === 'b') {
      marks.push({ type: 'bold' });
    } else if (tagName === 'em' || tagName === 'i') {
      marks.push({ type: 'italic' });
    } else if (tagName === 'u') {
      marks.push({ type: 'underline' });
    } else if (tagName === 's' || tagName === 'strike') {
      marks.push({ type: 'strikethrough' });
    } else if (tagName === 'code') {
      marks.push({ type: 'code' });
    }

    // Get text content and nested marks
    const children: any[] = [];
    Array.from(element.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          children.push({
            type: 'text',
            text,
            marks,
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const childElement = node as Element;
        const childResult = this.parseInlineElement(childElement);
        if (childResult) {
          // Merge marks
          if (childResult.type === 'text') {
            childResult.marks = [...marks, ...(childResult.marks || [])];
            children.push(childResult);
          } else if (Array.isArray(childResult)) {
            childResult.forEach((item: any) => {
              if (item.type === 'text') {
                item.marks = [...marks, ...(item.marks || [])];
              }
              children.push(item);
            });
          }
        }
      }
    });

    return children.length === 1 ? children[0] : children;
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

      // Events
      on: (event: string, callback: (data: unknown) => void) => this.on(event as EditorEvent, callback),
      off: (event: string, callback: (data: unknown) => void) => this.off(event as EditorEvent, callback),
      emit: (event: string, data?: unknown) => this.emit(event, data),

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
   * Register event listener
   */
  on(event: EditorEvent, callback: EditorEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  off(event: EditorEvent, callback: EditorEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: unknown): void {
    this.eventListeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
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
  configure(config: EditorConfig): void {
    this.config = { ...this.config, ...config };

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

    this.eventListeners.clear();
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
