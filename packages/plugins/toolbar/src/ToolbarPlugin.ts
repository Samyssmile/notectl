/**
 * Toolbar Plugin Implementation
 */

import type { Plugin, PluginContext } from '@notectl/core';
import type { ToolbarConfig } from './types.js';
import { Toolbar } from './components/Toolbar.js';
import { TablePickerComponent } from './components/TablePicker.js';

/**
 * Default toolbar configuration with comprehensive formatting options
 */
export const DEFAULT_TOOLBAR_CONFIG: ToolbarConfig = {
  position: 'top',
  theme: 'light',
  sticky: true,
  showLabels: false,
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

  constructor(config: ToolbarConfig = {}) {
    this.config = { ...DEFAULT_TOOLBAR_CONFIG, ...config };
  }

  async init(context: PluginContext): Promise<void> {
    this.context = context;

    // Register formatting commands
    this.registerCommands(context);

    // Create and render toolbar
    this.renderToolbar(context);
  }

  async destroy(): Promise<void> {
    // Remove toolbar from DOM
    if (this.toolbar && this.toolbar.parentElement) {
      this.toolbar.parentElement.removeChild(this.toolbar);
    }

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
        this.context?.emit('change', {});
      } catch (error) {
        console.error(`Failed to apply alignment:`, error);
      }
    });

    context.registerCommand('format.fontSize', (...args: unknown[]) => {
      const size = args[0] as number;
      try {
        document.execCommand('fontSize', false, String(size));
        this.context?.emit('change', {});
      } catch (error) {
        console.error(`Failed to set font size:`, error);
      }
    });

    context.registerCommand('format.fontFamily', (...args: unknown[]) => {
      const family = args[0] as string;
      try {
        document.execCommand('fontName', false, family);
        this.context?.emit('change', {});
      } catch (error) {
        console.error(`Failed to set font family:`, error);
      }
    });

    context.registerCommand('list.ordered', () => {
      try {
        document.execCommand('insertOrderedList', false);
        this.context?.emit('change', {});
      } catch (error) {
        console.error(`Failed to insert ordered list:`, error);
      }
    });

    context.registerCommand('list.unordered', () => {
      try {
        document.execCommand('insertUnorderedList', false);
        this.context?.emit('change', {});
      } catch (error) {
        console.error(`Failed to insert unordered list:`, error);
      }
    });

    context.registerCommand('insert.link', () => {
      const url = prompt('Enter URL:');
      if (url) {
        try {
          document.execCommand('createLink', false, url);
          this.context?.emit('change', {});
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
          this.context?.emit('change', {});
        } catch (error) {
          console.error(`Failed to insert image:`, error);
        }
      }
    });

    context.registerCommand('insert.code', () => {
      try {
        document.execCommand('formatBlock', false, 'pre');
        this.context?.emit('change', {});
      } catch (error) {
        console.error(`Failed to insert code block:`, error);
      }
    });

    context.registerCommand('insert.table', (...args: unknown[]) => {
      // If called programmatically with args, insert directly
      if (args.length >= 2) {
        const rows = args[0] as number;
        const cols = args[1] as number;
        this.insertTableAtCursor(rows, cols);
        return;
      }

      // Otherwise show the table picker
      if (!this.tablePicker) {
        this.tablePicker = new TablePickerComponent();
        document.body.appendChild(this.tablePicker);

        this.tablePicker.setSelectHandler((rows: number, cols: number) => {
          this.insertTableAtCursor(rows, cols);
        });
      }

      // Find the table button to position the picker
      const tableButton = this.toolbar?.shadowRoot?.querySelector('[data-command="insert.table"]');
      if (tableButton) {
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
    this.config = { ...this.config, ...newConfig };
    if (this.toolbar) {
      this.toolbar.updateConfig(this.config);
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
      this.context?.emit('change', {});
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
      this.context?.emit('change', {});
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
      this.context?.emit('change', {});
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
}

/**
 * Factory function to create toolbar plugin
 */
export function createToolbarPlugin(config?: ToolbarConfig): Plugin {
  return new ToolbarPlugin(config);
}
