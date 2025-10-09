/**
 * Angular component wrapper for NotectlEditor
 */

import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ViewEncapsulation,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NotectlEditor as NotectlEditorCore } from '@notectl/core';
import type { EditorConfig, EditorAPI } from '@notectl/core';

/**
 * NotectlEditor Angular component
 */
@Component({
  selector: 'notectl-editor',
  template: '<div #container [attr.data-notectl-angular-wrapper]="true"></div>',
  styles: [':host { display: block; }'],
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NotectlEditorComponent),
      multi: true,
    },
  ],
})
export class NotectlEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  /** Debug mode */
  @Input() debug?: boolean;

  /** Initial content */
  @Input() content?: string | object;

  /** Placeholder text */
  @Input() placeholder?: string;

  /** Read-only mode */
  @Input() readOnly?: boolean;

  /** Accessibility configuration */
  @Input() accessibility?: EditorConfig['accessibility'];

  /** Internationalization configuration */
  @Input() i18n?: EditorConfig['i18n'];

  /** Theme configuration */
  @Input() theme?: EditorConfig['theme'];

  /** Custom class name */
  @Input() className?: string;

  /** Emitted when content changes */
  @Output() contentChange = new EventEmitter<unknown>();

  /** Emitted when selection changes */
  @Output() selectionChange = new EventEmitter<unknown>();

  /** Emitted when editor gains focus */
  @Output() editorFocus = new EventEmitter<void>();

  /** Emitted when editor loses focus */
  @Output() editorBlur = new EventEmitter<void>();

  /** Emitted when editor is ready */
  @Output() ready = new EventEmitter<EditorAPI>();

  /** Emitted when an error occurs */
  @Output() error = new EventEmitter<Error>();

  private editor: NotectlEditorCore | null = null;
  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    this.initEditor();
  }

  ngOnDestroy(): void {
    this.destroyEditor();
  }

  /**
   * Initialize the editor instance
   */
  private initEditor(): void {
    if (!this.containerRef?.nativeElement) {
      console.error('NotectlEditor: Container element not found');
      return;
    }

    // Create editor instance
    this.editor = document.createElement('notectl-editor') as NotectlEditorCore;

    // Configure editor
    const config: EditorConfig = {
      debug: this.debug,
      content: this.content,
      placeholder: this.placeholder,
      readOnly: this.readOnly,
      accessibility: this.accessibility,
      i18n: this.i18n,
      theme: this.theme,
    };
    this.editor.configure(config);

    // Attach event listeners
    this.editor.on('content-change', (data) => {
      const eventData = data as { content?: unknown };
      const content = eventData.content;
      this.contentChange.emit(content);
      this.onChange(content);
    });

    this.editor.on('selection-change', (data) => {
      const eventData = data as { selection?: unknown };
      this.selectionChange.emit(eventData.selection);
    });

    this.editor.on('focus', () => {
      this.editorFocus.emit();
      this.onTouched();
    });

    this.editor.on('blur', () => {
      this.editorBlur.emit();
    });

    this.editor.on('ready', () => {
      this.ready.emit(this.getEditorAPI());
    });

    this.editor.on('error', (data) => {
      const eventData = data as { error?: Error };
      if (eventData.error) {
        this.error.emit(eventData.error);
      }
    });

    // Mount editor
    this.containerRef.nativeElement.appendChild(this.editor);
  }

  /**
   * Destroy the editor instance
   */
  private destroyEditor(): void {
    if (this.editor) {
      this.editor.destroy();
      if (this.containerRef?.nativeElement?.contains(this.editor)) {
        this.containerRef.nativeElement.removeChild(this.editor);
      }
      this.editor = null;
    }
  }

  /**
   * Update editor configuration
   */
  private updateConfig(): void {
    if (!this.editor) return;

    const config: EditorConfig = {
      debug: this.debug,
      content: this.content,
      placeholder: this.placeholder,
      readOnly: this.readOnly,
      accessibility: this.accessibility,
      i18n: this.i18n,
      theme: this.theme,
    };
    this.editor.configure(config);
  }

  /**
   * Get editor API
   */
  private getEditorAPI(): EditorAPI {
    if (!this.editor) {
      throw new Error('Editor not initialized');
    }
    return this.editor as EditorAPI;
  }

  // ControlValueAccessor implementation
  writeValue(value: unknown): void {
    if (this.editor && typeof value === 'string') {
      this.editor.setContent(value);
    }
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (this.editor) {
      this.editor.configure({ readOnly: isDisabled });
    }
  }

  // Public API methods
  /**
   * Get current editor content
   */
  public getContent(): unknown {
    return this.editor?.getContent();
  }

  /**
   * Set editor content
   */
  public setContent(content: unknown): void {
    if (this.editor && typeof content === 'string') {
      this.editor.setContent(content);
    }
  }

  /**
   * Get current editor state
   */
  public getState(): unknown {
    return this.editor?.getState();
  }

  /**
   * Execute an editor command
   */
  public executeCommand(command: string, ...args: unknown[]): void {
    this.editor?.executeCommand(command, ...args);
  }

  /**
   * Register a plugin
   */
  public registerPlugin(plugin: unknown): void {
    this.editor?.registerPlugin(plugin as any);
  }

  /**
   * Unregister a plugin
   */
  public unregisterPlugin(pluginId: string): void {
    this.editor?.unregisterPlugin(pluginId);
  }
}
