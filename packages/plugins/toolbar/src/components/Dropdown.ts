/**
 * Toolbar Dropdown Web Component
 */

import type { ToolbarDropdown, DropdownOption } from '../types.js';
import type { PluginContext } from '@notectl/core';

/**
 * Toolbar dropdown custom element
 */
export class ToolbarDropdownComponent extends HTMLElement {
  private config: ToolbarDropdown;
  private context: PluginContext;
  private container: HTMLDivElement;
  private trigger: HTMLButtonElement;
  private menu: HTMLDivElement;
  private isOpen = false;
  private selectedValue?: string | number;

  constructor(config: ToolbarDropdown, context: PluginContext) {
    super();
    this.config = config;
    this.context = context;

    // Create dropdown elements
    this.container = document.createElement('div');
    this.trigger = document.createElement('button');
    this.menu = document.createElement('div');

    this.setupDropdown();
  }

  connectedCallback(): void {
    this.appendChild(this.container);
    this.setupEventListeners();
  }

  disconnectedCallback(): void {
    this.cleanup();
  }

  /**
   * Setup dropdown structure
   */
  private setupDropdown(): void {
    // Container
    this.container.className = 'notectl-toolbar-dropdown';
    this.container.setAttribute('role', 'combobox');
    this.container.setAttribute('aria-haspopup', 'listbox');
    this.container.setAttribute('aria-expanded', 'false');

    // Trigger button
    this.trigger.className = 'notectl-toolbar-dropdown-trigger';
    this.trigger.type = 'button';
    this.trigger.setAttribute('aria-label', this.config.tooltip || this.config.label);

    if (this.config.tooltip) {
      this.trigger.title = this.config.tooltip;
    }

    const label = document.createElement('span');
    label.className = 'notectl-toolbar-dropdown-label';
    label.textContent = this.config.label;
    this.trigger.appendChild(label);

    const arrow = document.createElement('span');
    arrow.className = 'notectl-toolbar-dropdown-arrow';
    arrow.innerHTML = '▼';
    this.trigger.appendChild(arrow);

    // Menu
    this.menu.className = 'notectl-toolbar-dropdown-menu';
    this.menu.setAttribute('role', 'listbox');
    this.menu.setAttribute('aria-label', `${this.config.label} options`);

    // Add options
    this.config.options.forEach((option) => {
      const optionButton = document.createElement('button');
      optionButton.className = 'notectl-toolbar-dropdown-option';
      optionButton.type = 'button';
      optionButton.setAttribute('role', 'option');
      optionButton.setAttribute('data-value', String(option.value));
      optionButton.textContent = option.label;

      optionButton.addEventListener('click', () => {
        this.handleOptionClick(option);
      });

      this.menu.appendChild(optionButton);
    });

    // Assemble
    this.container.appendChild(this.trigger);
    this.container.appendChild(this.menu);

    // Setup trigger click
    this.trigger.addEventListener('click', this.toggleMenu.bind(this));
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Close on outside click
    document.addEventListener('click', this.handleOutsideClick.bind(this));

    // Keyboard navigation
    this.container.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Toggle menu open/closed
   */
  private toggleMenu(event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.isOpen = !this.isOpen;
    this.container.setAttribute('aria-expanded', String(this.isOpen));

    if (this.isOpen) {
      this.menu.style.display = 'block';
      // Focus first option
      const firstOption = this.menu.querySelector('.notectl-toolbar-dropdown-option');
      if (firstOption instanceof HTMLElement) {
        firstOption.focus();
      }
    } else {
      this.menu.style.display = 'none';
    }
  }

  /**
   * Handle option click
   */
  private handleOptionClick(option: DropdownOption): void {
    this.selectedValue = option.value;

    // Update selected state
    this.menu.querySelectorAll('.notectl-toolbar-dropdown-option').forEach(el => {
      if (el.getAttribute('data-value') === String(option.value)) {
        el.setAttribute('aria-selected', 'true');
      } else {
        el.setAttribute('aria-selected', 'false');
      }
    });

    // Execute command if provided
    if (option.command) {
      try {
        if (option.args) {
          this.context.executeCommand(option.command, ...option.args);
        } else {
          this.context.executeCommand(option.command, option.value);
        }

        this.context.emit('toolbar:dropdown-select', {
          dropdownId: this.config.id,
          value: option.value,
          label: option.label,
        });
      } catch (error) {
        console.error(`Failed to execute command: ${option.command}`, error);
      }
    }

    // Close menu
    this.toggleMenu();
  }

  /**
   * Handle outside clicks
   */
  private handleOutsideClick(event: MouseEvent): void {
    if (this.isOpen && !this.container.contains(event.target as Node)) {
      this.toggleMenu();
    }
  }

  /**
   * Handle keyboard navigation
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.toggleMenu();
      }
      return;
    }

    const options = Array.from(this.menu.querySelectorAll('.notectl-toolbar-dropdown-option'));
    const currentIndex = options.findIndex(el => el === document.activeElement);

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.toggleMenu();
        this.trigger.focus();
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < options.length - 1) {
          (options[currentIndex + 1] as HTMLElement).focus();
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          (options[currentIndex - 1] as HTMLElement).focus();
        }
        break;

      case 'Home':
        event.preventDefault();
        (options[0] as HTMLElement).focus();
        break;

      case 'End':
        event.preventDefault();
        (options[options.length - 1] as HTMLElement).focus();
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (currentIndex >= 0) {
          (options[currentIndex] as HTMLElement).click();
        }
        break;
    }
  }

  /**
   * Get selected value
   */
  public getSelectedValue(): string | number | undefined {
    return this.selectedValue;
  }

  /**
   * Set selected value
   */
  public setSelectedValue(value: string | number): void {
    this.selectedValue = value;

    this.menu.querySelectorAll('.notectl-toolbar-dropdown-option').forEach(el => {
      if (el.getAttribute('data-value') === String(value)) {
        el.setAttribute('aria-selected', 'true');
      } else {
        el.setAttribute('aria-selected', 'false');
      }
    });
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    document.removeEventListener('click', this.handleOutsideClick.bind(this));
    this.trigger.removeEventListener('click', this.toggleMenu.bind(this));
    this.container.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }
}

// Define custom element
if (!customElements.get('notectl-toolbar-dropdown')) {
  customElements.define('notectl-toolbar-dropdown', ToolbarDropdownComponent);
}
