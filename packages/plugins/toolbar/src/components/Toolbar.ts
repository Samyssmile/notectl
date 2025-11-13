/**
 * Toolbar Web Component
 */

import type { ToolbarConfig } from '../types.js';
import { ToolbarButtonComponent } from './Button.js';
import { ToolbarDropdownComponent } from './Dropdown.js';
import { isToolbarButton, isToolbarDropdown } from '../types.js';
import type { PluginContext } from '@notectl/core';

/**
 * Toolbar custom element
 */
export class Toolbar extends HTMLElement {
  private config: ToolbarConfig;
  private context: PluginContext;
  private _shadowRoot: ShadowRoot;
  private buttons: Map<string, ToolbarButtonComponent> = new Map();
  private dropdowns: Map<string, ToolbarDropdownComponent> = new Map();

  constructor(config: ToolbarConfig, context: PluginContext) {
    super();
    this.config = config;
    this.context = context;
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback(): void {
    this.cleanup();
  }

  /**
   * Render the toolbar
   */
  private render(): void {
    const { position = 'top', theme = 'light', sticky = false } = this.config;

    // Create toolbar container
    const toolbar = document.createElement('div');
    toolbar.className = 'notectl-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Editor toolbar');
    toolbar.setAttribute('data-position', position);
    toolbar.setAttribute('data-theme', theme);
    toolbar.setAttribute('data-sticky', String(sticky));

    // Render items
    if (this.config.items && this.config.items.length > 0) {
      const groupedItems = this.groupItems();

      groupedItems.forEach((items, groupName) => {
        const group = document.createElement('div');
        group.className = 'notectl-toolbar-group';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', groupName || 'Toolbar group');

        items.forEach(item => {
          if (isToolbarButton(item)) {
            const button = new ToolbarButtonComponent(item, this.context);
            group.appendChild(button);
            this.buttons.set(item.id, button);
          } else if (isToolbarDropdown(item)) {
            const dropdown = new ToolbarDropdownComponent(item, this.context);
            dropdown.setAttribute('data-dropdown-id', item.id);
            group.appendChild(dropdown);
            this.dropdowns.set(item.id, dropdown);
          }
        });

        toolbar.appendChild(group);
      });
    }

    // Add styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();

    this._shadowRoot.innerHTML = '';
    this._shadowRoot.appendChild(style);
    this._shadowRoot.appendChild(toolbar);
  }

  /**
   * Group toolbar items by group property
   */
  private groupItems(): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    if (this.config.items) {
      this.config.items.forEach(item => {
        const groupName = item.group || 'default';
        if (!groups.has(groupName)) {
          groups.set(groupName, []);
        }
        groups.get(groupName)!.push(item);
      });
    }

    return groups;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for state updates to update button states
    this.context.on('state-update', this.updateButtonStates.bind(this));
    this.context.on('selection-change', this.updateButtonStates.bind(this));
  }

  /**
   * Update button active/disabled states based on editor state
   */
  private updateButtonStates(): void {
    // This would check editor state and update button appearance
    // For now, just demonstrate the pattern
    this.buttons.forEach(button => {
      button.updateState();
    });
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    this.context.off('state-update', this.updateButtonStates.bind(this));
    this.context.off('selection-change', this.updateButtonStates.bind(this));
    this.buttons.clear();
    this.dropdowns.clear();
  }

  /**
   * Get component styles
   */
  private getStyles(): string {
    return `
      .notectl-toolbar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px;
        background: var(--toolbar-bg, #ffffff);
        border-bottom: 1px solid var(--toolbar-border, #e0e0e0);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }

      .notectl-toolbar[data-position="bottom"] {
        border-top: 1px solid var(--toolbar-border, #e0e0e0);
        border-bottom: none;
      }

      .notectl-toolbar[data-sticky="true"] {
        position: sticky;
        top: 0;
        z-index: 100;
      }

      .notectl-toolbar-group {
        display: flex;
        align-items: center;
        gap: 2px;
        padding-right: 8px;
        margin-right: 8px;
        border-right: 1px solid var(--toolbar-separator, #e0e0e0);
      }

      .notectl-toolbar-group:last-child {
        border-right: none;
        padding-right: 0;
        margin-right: 0;
      }

      /* Button Styles */
      ::slotted(notectl-toolbar-button),
      notectl-toolbar-button {
        display: inline-block;
      }

      notectl-toolbar-button .notectl-toolbar-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
        min-width: 32px;
        height: 32px;
        background: var(--toolbar-button-bg, transparent);
        border: 1px solid transparent;
        border-radius: 4px;
        color: var(--toolbar-text, #333);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      notectl-toolbar-button .notectl-toolbar-button:hover {
        background: var(--toolbar-hover-bg, #f0f0f0);
        border-color: var(--toolbar-hover-border, #d0d0d0);
      }

      notectl-toolbar-button .notectl-toolbar-button:active {
        background: var(--toolbar-active-bg, #e0e0e0);
      }

      notectl-toolbar-button .notectl-toolbar-button.active {
        background: var(--toolbar-active-bg, #2196f3);
        color: var(--toolbar-active-text, #ffffff);
        border-color: var(--toolbar-active-border, #1976d2);
      }

      notectl-toolbar-button .notectl-toolbar-button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      notectl-toolbar-button .notectl-toolbar-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
      }

      notectl-toolbar-button .notectl-toolbar-label {
        margin-left: 4px;
        font-size: 13px;
      }

      /* Dropdown Styles */
      ::slotted(notectl-toolbar-dropdown),
      notectl-toolbar-dropdown {
        display: inline-block;
        position: relative;
      }

      notectl-toolbar-dropdown .notectl-toolbar-dropdown {
        position: relative;
      }

      notectl-toolbar-dropdown .notectl-toolbar-dropdown-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        min-width: 100px;
        height: 32px;
        background: var(--toolbar-button-bg, transparent);
        border: 1px solid var(--toolbar-border, #d0d0d0);
        border-radius: 4px;
        color: var(--toolbar-text, #333);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      notectl-toolbar-dropdown .notectl-toolbar-dropdown-trigger:hover {
        background: var(--toolbar-hover-bg, #f0f0f0);
        border-color: var(--toolbar-hover-border, #b0b0b0);
      }

      notectl-toolbar-dropdown .notectl-toolbar-dropdown-arrow {
        margin-left: 8px;
        font-size: 10px;
        color: #666;
      }

      notectl-toolbar-dropdown .notectl-toolbar-dropdown-menu {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        z-index: 1000;
        min-width: 150px;
        margin-top: 4px;
        padding: 4px;
        background: #ffffff;
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        max-height: 300px;
        overflow-y: auto;
      }

      notectl-toolbar-dropdown .notectl-toolbar-dropdown-option {
        display: block;
        width: 100%;
        padding: 8px 12px;
        background: transparent;
        border: none;
        border-radius: 2px;
        color: #333;
        font-size: 13px;
        text-align: left;
        cursor: pointer;
        transition: background 0.1s ease;
      }

      notectl-toolbar-dropdown .notectl-toolbar-dropdown-option:hover {
        background: #f0f0f0;
      }

      notectl-toolbar-dropdown .notectl-toolbar-dropdown-option:active,
      notectl-toolbar-dropdown .notectl-toolbar-dropdown-option[aria-selected="true"] {
        background: #e3f2fd;
        color: #1976d2;
      }

      .notectl-toolbar[data-theme="dark"] {
        --toolbar-bg: #2d2d2d;
        --toolbar-border: #404040;
        --toolbar-text: #e0e0e0;
        --toolbar-button-bg: transparent;
        --toolbar-hover-bg: #383838;
        --toolbar-hover-border: #505050;
        --toolbar-active-bg: #1e3a5f;
        --toolbar-active-border: #2196f3;
        --toolbar-active-text: #64b5f6;
        --toolbar-separator: #404040;
      }
    `;
  }

  /**
   * Update toolbar configuration
   */
  public updateConfig(newConfig: Partial<ToolbarConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.render();
  }

  public setDropdownValue(dropdownId: string, value?: string | number | null, label?: string): void {
    const dropdown = this.dropdowns.get(dropdownId);
    dropdown?.setSelectedValue(value ?? undefined, label);
  }
}

// Define custom element
if (!customElements.get('notectl-toolbar')) {
  customElements.define('notectl-toolbar', Toolbar);
}
