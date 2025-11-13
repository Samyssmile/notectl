/**
 * Toolbar Plugin Implementation
 */

import { fontRegistry, type Plugin, type PluginContext } from '@notectl/core';
import type {
  ToolbarConfig,
  ToolbarItem,
  ToolbarDropdown,
  ToolbarTableConfig,
  ToolbarFontsConfig,
  ToolbarFontFamilyOptionInput,
  DropdownOption,
  ToolbarDropdownSelectEvent,
} from './types.js';
import { isToolbarDropdown } from './types.js';
import type { TableConfig, TableMenuConfig } from './table/types.js';
import { Toolbar } from './components/Toolbar.js';
import { TablePickerComponent } from './components/TablePicker.js';
import {
  TableFeature,
  DEFAULT_TABLE_CONFIG as DEFAULT_TABLE_FEATURE_CONFIG,
  DEFAULT_MENU_CONFIG as DEFAULT_TABLE_MENU_CONFIG,
} from './table/index.js';

type ResolvedTableOptions = {
  enabled: boolean;
  config: TableConfig;
  menu: TableMenuConfig;
};

/**
 * Default toolbar configuration with comprehensive formatting options
 */
export const DEFAULT_TOOLBAR_CONFIG: ToolbarConfig = {
  position: 'top',
  theme: 'light',
  sticky: true,
  showLabels: false,
  table: {
    enabled: true,
    config: DEFAULT_TABLE_FEATURE_CONFIG,
    menu: DEFAULT_TABLE_MENU_CONFIG,
  },
  items: [
    // Basic formatting group
    {
      id: 'bold',
      label: 'Bold',
      icon: '<strong>B</strong>',
      command: 'format.bold',
      tooltip: 'Bold (Ctrl+B)',
      group: 'formatting',
    },
    {
      id: 'italic',
      label: 'Italic',
      icon: '<em>I</em>',
      command: 'format.italic',
      tooltip: 'Italic (Ctrl+I)',
      group: 'formatting',
    },
    {
      id: 'underline',
      label: 'Underline',
      icon: '<u>U</u>',
      command: 'format.underline',
      tooltip: 'Underline (Ctrl+U)',
      group: 'formatting',
    },
    {
      id: 'strikethrough',
      label: 'Strikethrough',
      icon: '<s>S</s>',
      command: 'format.strikethrough',
      tooltip: 'Strikethrough',
      group: 'formatting',
    },

    // Headings group
    {
      id: 'heading-1',
      label: 'H1',
      icon: 'H1',
      command: 'format.heading',
      args: [1],
      tooltip: 'Heading 1',
      group: 'headings',
    },
    {
      id: 'heading-2',
      label: 'H2',
      icon: 'H2',
      command: 'format.heading',
      args: [2],
      tooltip: 'Heading 2',
      group: 'headings',
    },
    {
      id: 'heading-3',
      label: 'H3',
      icon: 'H3',
      command: 'format.heading',
      args: [3],
      tooltip: 'Heading 3',
      group: 'headings',
    },
    {
      id: 'paragraph',
      label: 'P',
      icon: '¶',
      command: 'format.paragraph',
      tooltip: 'Paragraph',
      group: 'headings',
    },

    // Alignment group
    {
      id: 'align-left',
      label: 'Align Left',
      icon: '≡',
      command: 'format.align',
      args: ['left'],
      tooltip: 'Align left',
      group: 'alignment',
    },
    {
      id: 'align-center',
      label: 'Center',
      icon: '≡',
      command: 'format.align',
      args: ['center'],
      tooltip: 'Center',
      group: 'alignment',
    },
    {
      id: 'align-right',
      label: 'Align Right',
      icon: '≡',
      command: 'format.align',
      args: ['right'],
      tooltip: 'Align right',
      group: 'alignment',
    },
    {
      id: 'align-justify',
      label: 'Justify',
      icon: '≡',
      command: 'format.align',
      args: ['justify'],
      tooltip: 'Justify',
      group: 'alignment',
    },

    // Lists group
    {
      id: 'ordered-list',
      label: 'Ordered List',
      icon: '1.',
      command: 'list.ordered',
      tooltip: 'Numbered list',
      group: 'lists',
    },
    {
      id: 'unordered-list',
      label: 'Unordered List',
      icon: '•',
      command: 'list.unordered',
      tooltip: 'Bullet list',
      group: 'lists',
    },

    // Insert group
    {
      id: 'link',
      label: 'Link',
      icon: '🔗',
      command: 'insert.link',
      tooltip: 'Insert link',
      group: 'insert',
    },
    {
      id: 'image',
      label: 'Image',
      icon: '🖼',
      command: 'insert.image',
      tooltip: 'Insert image',
      group: 'insert',
    },
    {
      id: 'table',
      label: 'Table',
      icon: '⊞',
      command: 'insert.table',
      tooltip: 'Insert table',
      group: 'insert',
    },

    // History group
    {
      id: 'undo',
      label: 'Undo',
      icon: '↶',
      command: 'history.undo',
      tooltip: 'Undo (Ctrl+Z)',
      group: 'history',
    },
    {
      id: 'redo',
      label: 'Redo',
      icon: '↷',
      command: 'history.redo',
      tooltip: 'Redo (Ctrl+Y)',
      group: 'history',
    },

    // Font dropdowns
    {
      id: 'font-size',
      label: 'Size',
      options: [
        { label: '10px', value: 10, command: 'format.fontSize', args: [10] },
        { label: '12px', value: 12, command: 'format.fontSize', args: [12] },
        { label: '14px', value: 14, command: 'format.fontSize', args: [14] },
        { label: '16px', value: 16, command: 'format.fontSize', args: [16] },
        { label: '18px', value: 18, command: 'format.fontSize', args: [18] },
        { label: '20px', value: 20, command: 'format.fontSize', args: [20] },
        { label: '24px', value: 24, command: 'format.fontSize', args: [24] },
        { label: '32px', value: 32, command: 'format.fontSize', args: [32] },
      ],
      tooltip: 'Font size',
      group: 'font',
    },
    {
      id: 'font-family',
      label: 'Font',
      options: [
        { label: 'Sans Serif', value: 'sans-serif', command: 'format.fontFamily', args: ['sans-serif'] },
        { label: 'Serif', value: 'serif', command: 'format.fontFamily', args: ['serif'] },
        { label: 'Monospace', value: 'monospace', command: 'format.fontFamily', args: ['monospace'] },
        { label: 'Arial', value: 'Arial', command: 'format.fontFamily', args: ['Arial'] },
        { label: 'Times New Roman', value: 'Times New Roman', command: 'format.fontFamily', args: ['Times New Roman'] },
        { label: 'Courier New', value: 'Courier New', command: 'format.fontFamily', args: ['Courier New'] },
      ],
      tooltip: 'Font family',
      group: 'font',
    },

    // Code group
    {
      id: 'code',
      label: 'Code',
      icon: '<code>&lt;/&gt;</code>',
      command: 'insert.code',
      tooltip: 'Insert code block',
      group: 'code',
    },
  ],
};

/**
 * Toolbar Plugin
 */
export class ToolbarPlugin implements Plugin {
  id = '@notectl/plugin-toolbar';
  name = 'Toolbar Plugin';
  version = '0.0.1';

  private context?: PluginContext;
  private toolbar?: Toolbar;
  private config: ToolbarConfig;
  private isVisible = true;
  private tablePicker?: TablePickerComponent;
  private tableFeature?: TableFeature;
  private tableOptions: ResolvedTableOptions;
  private rawItems?: ToolbarItem[];
  private baseItems?: ToolbarItem[];
  private fontOptions?: ToolbarFontsConfig;
  private readonly selectionListener = () => this.syncFontDropdownWithSelection();
  private readonly dropdownSelectListener = (payload?: ToolbarDropdownSelectEvent) => {
    if (!payload || payload.dropdownId !== 'font-family') {
      return;
    }
    this.currentFontValue = payload.value;
    this.currentFontLabel = payload.label;
  };
  private currentFontLabel?: string;
  private currentFontValue?: string | number;

  constructor(config: ToolbarConfig = {}) {
    this.tableOptions = this.resolveTableOptions(config.table);
    const mergedConfig: ToolbarConfig = {
      ...DEFAULT_TOOLBAR_CONFIG,
      ...config,
      table: {
        ...DEFAULT_TOOLBAR_CONFIG.table,
        ...config.table,
      },
    };

    this.fontOptions = this.resolveFontOptions(mergedConfig.fonts);
    this.rawItems = mergedConfig.items ? [...mergedConfig.items] : undefined;
    this.baseItems = this.applyFontOptions(this.rawItems, this.fontOptions);

    this.config = {
      ...mergedConfig,
      items: this.applyTableItemVisibility(this.baseItems, this.tableOptions.enabled),
      table: this.materializeTableConfig(),
      fonts: this.fontOptions,
    };
  }

  async init(context: PluginContext): Promise<void> {
    this.context = context;

    // Register formatting commands
    this.registerCommands(context);

    // Create and render toolbar
    this.ensureFontOptionsFromRegistry();
    this.renderToolbar(context);

    if (this.tableOptions.enabled) {
      this.ensureTableFeature(context);
    }

    context.on('selection-change', this.selectionListener);
    context.on('change', this.selectionListener);
    context.on('toolbar:dropdown-select', this.dropdownSelectListener);
    this.syncFontDropdownWithSelection();
  }

  async destroy(): Promise<void> {
    if (this.context) {
      this.context.off('selection-change', this.selectionListener);
      this.context.off('change', this.selectionListener);
      this.context.off('toolbar:dropdown-select', this.dropdownSelectListener);
    }

    // Remove toolbar from DOM
    if (this.toolbar && this.toolbar.parentElement) {
      this.toolbar.parentElement.removeChild(this.toolbar);
    }

    if (this.tablePicker && this.tablePicker.parentElement) {
      this.tablePicker.parentElement.removeChild(this.tablePicker);
    }

    this.disposeTableFeature();

    this.tablePicker = undefined;
    this.toolbar = undefined;
    this.context = undefined;
  }

  /**
   * Register toolbar commands
   */
  private registerCommands(context: PluginContext): void {
    // Toolbar control commands
    context.registerCommand('toolbar.toggle', () => {
      this.toggleVisibility();
    });

    context.registerCommand('toolbar.show', () => {
      this.show();
    });

    context.registerCommand('toolbar.hide', () => {
      this.hide();
    });

    context.registerCommand('toolbar.updateConfig', (...args: unknown[]) => {
      this.updateConfig(args[0] as Partial<ToolbarConfig>);
    });

    // Register format commands that toolbar buttons will use
    context.registerCommand('format.bold', () => {
      this.applyFormatting('bold');
    });

    context.registerCommand('format.italic', () => {
      this.applyFormatting('italic');
    });

    context.registerCommand('format.underline', () => {
      this.applyFormatting('underline');
    });

    context.registerCommand('format.strikethrough', () => {
      this.applyFormatting('strikethrough');
    });

    // Heading commands
    context.registerCommand('format.heading', (...args: unknown[]) => {
      this.applyHeading(args[0] as number);
    });

    context.registerCommand('format.paragraph', () => {
      this.applyParagraph();
    });

    context.registerCommand('format.align', (...args: unknown[]) => {
      const alignment = args[0] as string;
      // Alignment formatting (will be implemented with proper Delta operations)
      try {
        document.execCommand('justify' + alignment.charAt(0).toUpperCase() + alignment.slice(1), false);
        this.emitChange();
      } catch (error) {
        console.error(`Failed to apply alignment:`, error);
      }
    });

    context.registerCommand('format.fontSize', (...args: unknown[]) => {
      const size = args[0] as number;
      try {
        document.execCommand('fontSize', false, String(size));
        this.emitChange();
      } catch (error) {
        console.error(`Failed to set font size:`, error);
      }
    });

    context.registerCommand('format.fontFamily', (...args: unknown[]) => {
      const family = args[0] as string;
      try {
        document.execCommand('fontName', false, family);
        this.emitChange();
      } catch (error) {
        console.error(`Failed to set font family:`, error);
      }
    });

    context.registerCommand('list.ordered', () => {
      try {
        document.execCommand('insertOrderedList', false);
        this.emitChange();
      } catch (error) {
        console.error(`Failed to insert ordered list:`, error);
      }
    });

    context.registerCommand('list.unordered', () => {
      try {
        document.execCommand('insertUnorderedList', false);
        this.emitChange();
      } catch (error) {
        console.error(`Failed to insert unordered list:`, error);
      }
    });

    context.registerCommand('insert.link', () => {
      const url = prompt('Enter URL:');
      if (url) {
        try {
          document.execCommand('createLink', false, url);
          this.emitChange();
        } catch (error) {
          console.error(`Failed to insert link:`, error);
        }
      }
    });

    context.registerCommand('insert.image', () => {
      const src = prompt('Enter image URL:');
      if (src) {
        try {
          document.execCommand('insertImage', false, src);
          this.emitChange();
        } catch (error) {
          console.error(`Failed to insert image:`, error);
        }
      }
    });

    context.registerCommand('insert.code', () => {
      try {
        document.execCommand('formatBlock', false, 'pre');
        this.emitChange();
      } catch (error) {
        console.error(`Failed to insert code block:`, error);
      }
    });

    context.registerCommand('insert.table', (...args: unknown[]) => {
      if (!this.tableOptions.enabled) {
        console.warn('Table functionality is disabled in the current toolbar configuration.');
        return;
      }

      const rows = typeof args[0] === 'number' ? (args[0] as number) : undefined;
      const cols = typeof args[1] === 'number' ? (args[1] as number) : undefined;

      // If called programmatically with specific dimensions, insert directly
      if (typeof rows === 'number' && typeof cols === 'number') {
        try {
          context.executeCommand('table.insert', rows, cols);
          return;
        } catch (error) {
          // Fall back to DOM insertion if table plugin is not available
          if (error instanceof Error && error.message.includes('Command not found: table.insert')) {
            this.insertTableAtCursor(rows, cols);
            return;
          } else {
            console.error('Failed to insert table:', error);
            return;
          }
        }
      }

      // Otherwise show the table picker
      if (!this.tablePicker) {
        this.tablePicker = new TablePickerComponent();
        document.body.appendChild(this.tablePicker);

        this.tablePicker.setSelectHandler((pickedRows: number, pickedCols: number) => {
          try {
            context.executeCommand('table.insert', pickedRows, pickedCols);
          } catch (error) {
            if (error instanceof Error && error.message.includes('Command not found: table.insert')) {
              this.insertTableAtCursor(pickedRows, pickedCols);
            } else {
              console.error('Failed to insert table via plugin command.', error);
            }
          }
        });
      }

      // Find the table button to position the picker
      const tableButton = this.toolbar?.shadowRoot?.querySelector('[data-command="insert.table"]');
      if (tableButton && this.tablePicker) {
        const rect = tableButton.getBoundingClientRect();
        this.tablePicker.show(rect.left, rect.bottom + 5);
      }

      // Close picker when clicking outside
      const closeHandler = (e: MouseEvent) => {
        if (this.tablePicker && !this.tablePicker.contains(e.target as Node)) {
          this.tablePicker.hide();
          document.removeEventListener('click', closeHandler);
        }
      };

      setTimeout(() => {
        document.addEventListener('click', closeHandler);
      }, 0);
    });

    context.registerCommand('history.undo', () => {
      context.emit('undo');
    });

    context.registerCommand('history.redo', () => {
      context.emit('redo');
    });
  }

  /**
   * Render toolbar UI
   */
  private renderToolbar(context: PluginContext): void {
    this.toolbar = new Toolbar(this.config, context);

    // Get the plugin container (not the editable content)
    const position = (this.config.position || 'top') as 'top' | 'bottom';
    const pluginContainer = context.getPluginContainer(position);

    // Insert toolbar into plugin container
    pluginContainer.appendChild(this.toolbar);
  }

  /**
   * Toggle toolbar visibility
   */
  private toggleVisibility(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show toolbar
   */
  private show(): void {
    if (this.toolbar) {
      this.toolbar.style.display = '';
      this.isVisible = true;
    }
  }

  /**
   * Hide toolbar
   */
  private hide(): void {
    if (this.toolbar) {
      this.toolbar.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Update toolbar configuration
   */
  private updateConfig(newConfig: Partial<ToolbarConfig>): void {
    if (newConfig.table) {
      this.tableOptions = this.resolveTableOptions(newConfig.table);
    }

    if (!this.rawItems && this.baseItems) {
      this.rawItems = [...this.baseItems];
    }

    if (newConfig.items) {
      this.rawItems = [...newConfig.items];
    }

    if (newConfig.fonts) {
      this.fontOptions = this.resolveFontOptions({
        ...this.fontOptions,
        ...newConfig.fonts,
      });
    }

    this.baseItems = this.applyFontOptions(this.rawItems, this.fontOptions);

    const items = this.applyTableItemVisibility(this.baseItems, this.tableOptions.enabled);

    this.config = {
      ...this.config,
      ...newConfig,
      items,
      table: this.materializeTableConfig(),
      fonts: this.fontOptions,
    };

    if (this.tableOptions.enabled) {
      if (this.context) {
        this.ensureTableFeature(this.context);
      }
    } else {
      this.disposeTableFeature();
    }

    if (this.toolbar) {
      this.toolbar.updateConfig(this.config);
      this.syncFontDropdownWithSelection();
    }
  }

  /**
   * Emit change event with current state
   */
  private emitChange(): void {
    if (this.context) {
      this.context.emit('change', { state: this.context.getState() });
    }
  }

  /**
   * Apply formatting using execCommand
   */
  private applyFormatting(format: string): void {
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
      }
      this.emitChange();
    } catch (error) {
      console.error(`Failed to apply ${format}:`, error);
    }
  }

  /**
   * Apply heading format
   */
  private applyHeading(level: number): void {
    try {
      document.execCommand('formatBlock', false, `h${level}`);
      this.emitChange();
    } catch (error) {
      console.error(`Failed to apply heading:`, error);
    }
  }

  /**
   * Apply paragraph format
   */
  private applyParagraph(): void {
    try {
      document.execCommand('formatBlock', false, 'p');
      this.emitChange();
    } catch (error) {
      console.error(`Failed to apply paragraph:`, error);
    }
  }

  /**
   * Insert table at cursor position
   */
  private insertTableAtCursor(rows: number, cols: number): void {
    try {
      const container = this.context?.getContainer();
      if (container) {
        const root = container.getRootNode();
        if (root && 'host' in root) {
          const editorElement = (root as ShadowRoot).host;
          if (editorElement && 'insertTable' in editorElement) {
            (editorElement as any).insertTable(rows, cols);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to insert table:`, error);
    }
  }

  /**
   * Resolve toolbar table options with defaults
   */
  private resolveTableOptions(table?: ToolbarTableConfig): ResolvedTableOptions {
    const defaultOptions = DEFAULT_TOOLBAR_CONFIG.table ?? { enabled: true };
    return {
      enabled: table?.enabled ?? defaultOptions.enabled ?? true,
      config: {
        ...DEFAULT_TABLE_FEATURE_CONFIG,
        ...(table?.config ?? {}),
      },
      menu: {
        ...DEFAULT_TABLE_MENU_CONFIG,
        ...(table?.menu ?? {}),
      },
    };
  }

  /**
   * Enable/disable table button in toolbar items
   */
  private applyTableItemVisibility(
    items: ToolbarItem[] | undefined,
    enabled: boolean
  ): ToolbarItem[] | undefined {
    if (!items) {
      return items;
    }

    if (enabled) {
      return [...items];
    }

    return items.filter(item => item.id !== 'table');
  }

  private resolveFontOptions(options?: ToolbarFontsConfig): ToolbarFontsConfig | undefined {
    if (options?.families && options.families.length > 0) {
      return {
        ...options,
        families: [...options.families],
      };
    }

    const registeredFonts = fontRegistry.getRegisteredFonts();
    if (registeredFonts.length === 0) {
      return options;
    }

    return {
      extendDefaults: options?.extendDefaults ?? true,
      families: registeredFonts.map((font) => ({
        label: font.label,
        value: font.family,
      })),
    };
  }

  private ensureFontOptionsFromRegistry(): void {
    if (this.fontOptions?.families && this.fontOptions.families.length > 0) {
      return;
    }

    const resolved = this.resolveFontOptions(this.fontOptions);
    if (!resolved || !resolved.families || resolved.families.length === 0) {
      return;
    }

    this.fontOptions = resolved;
    this.baseItems = this.applyFontOptions(this.rawItems, this.fontOptions);
    this.config = {
      ...this.config,
      items: this.applyTableItemVisibility(this.baseItems, this.tableOptions.enabled),
      fonts: this.fontOptions,
    };
  }

  /**
   * Extend or replace the font dropdown options.
   */
  private applyFontOptions(
    items: ToolbarItem[] | undefined,
    fonts?: ToolbarFontsConfig
  ): ToolbarItem[] | undefined {
    if (!items) {
      return items;
    }

    const fontFamilies = fonts?.families ?? [];
    if (fontFamilies.length === 0) {
      return [...items];
    }

    const normalized = this.normalizeFontFamilies(fontFamilies);
    if (normalized.length === 0) {
      return [...items];
    }

    const extendDefaults = fonts?.extendDefaults !== false;

    return items.map((item) => {
      if (item.id !== 'font-family' || !('options' in item)) {
        return item;
      }

      const baseOptions = extendDefaults ? [...item.options] : [];
      const mergedOptions = extendDefaults
        ? this.mergeFontDropdownOptions(baseOptions, normalized)
        : this.mergeFontDropdownOptions([], normalized);

      return {
        ...item,
        options: mergedOptions,
      };
    });
  }

  private normalizeFontFamilies(families: ToolbarFontFamilyOptionInput[]): DropdownOption[] {
    const normalized: DropdownOption[] = [];

    for (const entry of families) {
      if (typeof entry === 'string') {
        const value = entry.trim();
        if (!value) continue;
        normalized.push({
          label: value,
          value,
          command: 'format.fontFamily',
          args: [value],
        });
        continue;
      }

      const value = entry.value?.trim();
      if (!value) {
        continue;
      }

      const rawLabel = entry.label ?? value;
      const label = rawLabel.trim().length > 0 ? rawLabel.trim() : value;

      normalized.push({
        label,
        value,
        command: 'format.fontFamily',
        args: [value],
      });
    }

    return normalized;
  }

  private mergeFontDropdownOptions(base: DropdownOption[], extras: DropdownOption[]): DropdownOption[] {
    const merged = [...base];
    const seen = new Set<string>(base.map(option => String(option.value)));

    for (const option of extras) {
      const key = String(option.value);
      if (seen.has(key)) {
        continue;
      }

      merged.push(option);
      seen.add(key);
    }

    return merged;
  }

  private syncFontDropdownWithSelection(): void {
    if (!this.toolbar) {
      return;
    }

    const dropdown = this.getFontDropdownConfig();
    if (!dropdown) {
      return;
    }

    const detected = this.detectSelectionFontFamily();
    const fontFamily = detected.value;
    if (!fontFamily) {
      this.applyDropdownValue(this.currentFontValue, this.currentFontLabel);
      return;
    }

    const match = this.findMatchingFontOption(fontFamily, dropdown.options);
    if (match) {
      this.applyDropdownValue(match.value, match.label);
      return;
    }

    if (detected.source === 'fallback' && this.currentFontLabel) {
      this.applyDropdownValue(this.currentFontValue, this.currentFontLabel);
      return;
    }

    this.applyDropdownValue(undefined, this.extractPrimaryFont(fontFamily));
  }

  private detectSelectionFontFamily(): { value: string | null; source: 'command' | 'selection' | 'fallback' | null } {
    if (!this.context) {
      return { value: null, source: null };
    }

    const container = this.context.getContainer();
    if (!container) {
      return { value: null, source: null };
    }

    const documentFont = this.queryDocumentFontName(container.ownerDocument);
    if (documentFont) {
      return { value: documentFont, source: 'command' };
    }

    const selection = container.ownerDocument?.getSelection();
    if (selection && selection.rangeCount > 0) {
      const anchorNode = selection.anchorNode;
      if (anchorNode) {
        const element = this.findElementWithinContainer(anchorNode, container);
        if (element && container.contains(element)) {
          const computed = element.ownerDocument?.defaultView?.getComputedStyle(element);
          if (computed?.fontFamily) {
            return { value: computed.fontFamily, source: 'selection' };
          }
        }
      }
    }

    return { value: this.getFallbackFontFamily(container), source: 'fallback' };
  }

  private findElementWithinContainer(node: Node, container: HTMLElement): HTMLElement | null {
    let current: Node | null = node;

    while (current && current !== container) {
      if (current instanceof HTMLElement) {
        return current;
      }
      current = current.parentNode;
    }

    return container instanceof HTMLElement ? container : null;
  }

  private getFontDropdownConfig(): ToolbarDropdown | undefined {
    if (!this.config.items) {
      return undefined;
    }

    return this.config.items.find((item) => item.id === 'font-family' && isToolbarDropdown(item)) as
      | ToolbarDropdown
      | undefined;
  }

  private findMatchingFontOption(fontFamily: string, options: DropdownOption[]): DropdownOption | undefined {
    const tokens = this.tokenizeFontFamily(fontFamily);
    if (tokens.length === 0 || options.length === 0) {
      return undefined;
    }

    const optionLookup = this.createFontOptionLookup(options);
    for (const token of tokens) {
      const match = optionLookup.get(token);
      if (match) {
        return match;
      }
    }

    return undefined;
  }

  private tokenizeFontFamily(fontFamily: string): string[] {
    if (!fontFamily) {
      return [];
    }

    return fontFamily
      .split(',')
      .map((token) => this.normalizeFontToken(token))
      .filter((token): token is string => Boolean(token));
  }

  private createFontOptionLookup(options: DropdownOption[]): Map<string, DropdownOption> {
    const lookup = new Map<string, DropdownOption>();

    for (const option of options) {
      const normalizedValue = this.normalizeFontToken(
        typeof option.value === 'string' ? option.value : String(option.value ?? '')
      );
      if (!normalizedValue || lookup.has(normalizedValue)) {
        continue;
      }

      lookup.set(normalizedValue, option);
    }

    return lookup;
  }

  private extractPrimaryFont(fontFamily: string): string {
    const first = fontFamily.split(',')[0] || fontFamily;
    return first.replace(/['\"]/g, '').trim();
  }

  private normalizeFontToken(token: string): string {
    return token.replace(/['\"]/g, '').trim().toLowerCase();
  }

  private getFallbackFontFamily(container: HTMLElement): string | null {
    const ownerWindow = container.ownerDocument?.defaultView;
    if (!ownerWindow) {
      return null;
    }

    const computed = ownerWindow.getComputedStyle(container);
    return computed?.fontFamily ?? null;
  }

  private queryDocumentFontName(doc?: Document | null): string | null {
    if (!doc || typeof doc.queryCommandValue !== 'function') {
      return null;
    }

    try {
      const value = doc.queryCommandValue('fontName');
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    } catch {
      // ignore
    }

    return null;
  }

  private applyDropdownValue(value?: string | number | null, label?: string | null | undefined): void {
    if (!this.toolbar) {
      return;
    }

    this.toolbar.setDropdownValue('font-family', value ?? undefined, label ?? undefined);

    if (label) {
      this.currentFontLabel = label;
      this.currentFontValue = value ?? undefined;
    }
  }

  /**
   * Ensure table feature is active with current config
   */
  private ensureTableFeature(context: PluginContext): void {
    if (!this.tableFeature) {
      this.tableFeature = new TableFeature({
        config: this.tableOptions.config,
        menuConfig: this.tableOptions.menu,
      });
      this.tableFeature.init(context);
      return;
    }

    this.tableFeature.updateConfig({
      config: this.tableOptions.config,
      menuConfig: this.tableOptions.menu,
    });
  }

  /**
   * Dispose table feature resources
   */
  private disposeTableFeature(): void {
    if (this.tableFeature) {
      this.tableFeature.destroy();
      this.tableFeature = undefined;
    }
  }

  /**
   * Provide current table configuration snapshot
   */
  private materializeTableConfig(): ToolbarTableConfig {
    return {
      enabled: this.tableOptions.enabled,
      config: { ...this.tableOptions.config },
      menu: { ...this.tableOptions.menu },
    };
  }
}

/**
 * Factory function to create toolbar plugin
 */
export function createToolbarPlugin(config?: ToolbarConfig): Plugin {
  return new ToolbarPlugin(config);
}
