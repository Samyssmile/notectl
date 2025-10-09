/**
 * Toolbar Button Web Component
 */

import type { ToolbarButton, ButtonState } from '../types.js';
import type { PluginContext } from '@notectl/core';

/**
 * Toolbar button custom element
 */
export class ToolbarButtonComponent extends HTMLElement {
  private config: ToolbarButton;
  private context: PluginContext;
  private button: HTMLButtonElement;
  private state: ButtonState = {
    active: false,
    disabled: false,
  };

  constructor(config: ToolbarButton, context: PluginContext) {
    super();
    this.config = config;
    this.context = context;

    // Create button element
    this.button = document.createElement('button');
    this.setupButton();
  }

  connectedCallback(): void {
    this.appendChild(this.button);
  }

  disconnectedCallback(): void {
    this.cleanup();
  }

  /**
   * Setup button element
   */
  private setupButton(): void {
    this.button.className = 'notectl-toolbar-button';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', this.config.tooltip || this.config.label);
    this.button.setAttribute('data-command', this.config.command);

    if (this.config.tooltip) {
      this.button.title = this.config.tooltip;
    }

    // Add icon
    if (this.config.icon) {
      const icon = document.createElement('span');
      icon.className = 'notectl-toolbar-icon';
      icon.innerHTML = this.config.icon;
      this.button.appendChild(icon);
    }

    // Add label
    const label = document.createElement('span');
    label.className = 'notectl-toolbar-label';
    label.textContent = this.config.label;
    this.button.appendChild(label);

    // Setup click handler
    this.button.addEventListener('click', this.handleClick.bind(this));
  }

  /**
   * Handle button click
   */
  private handleClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.state.disabled) {
      return;
    }

    try {
      // Execute command
      if (this.config.args) {
        this.context.executeCommand(this.config.command, ...this.config.args);
      } else {
        this.context.executeCommand(this.config.command);
      }

      // Emit button click event
      this.context.emit('toolbar:button-click', {
        buttonId: this.config.id,
        command: this.config.command,
      });
    } catch (error) {
      console.error(`Failed to execute command: ${this.config.command}`, error);
      this.context.emit('toolbar:command-error', {
        buttonId: this.config.id,
        command: this.config.command,
        error,
      });
    }
  }

  /**
   * Update button state
   */
  public updateState(newState?: Partial<ButtonState>): void {
    if (newState) {
      this.state = { ...this.state, ...newState };
    }

    // Update active state
    if (this.state.active) {
      this.button.setAttribute('aria-pressed', 'true');
      this.button.classList.add('active');
    } else {
      this.button.setAttribute('aria-pressed', 'false');
      this.button.classList.remove('active');
    }

    // Update disabled state
    if (this.state.disabled) {
      this.button.disabled = true;
      this.button.setAttribute('aria-disabled', 'true');
    } else {
      this.button.disabled = false;
      this.button.setAttribute('aria-disabled', 'false');
    }
  }

  /**
   * Get button state
   */
  public getState(): ButtonState {
    return { ...this.state };
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    this.button.removeEventListener('click', this.handleClick.bind(this));
  }
}

// Define custom element
if (!customElements.get('notectl-toolbar-button')) {
  customElements.define('notectl-toolbar-button', ToolbarButtonComponent);
}
