/**
 * Angular directive for NotectlEditor (optional alternative to component)
 */

import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NotectlEditor as NotectlEditorCore } from '@notectl/core';
import type { EditorConfig, EditorAPI } from '@notectl/core';

/**
 * Directive to use NotectlEditor on any element
 * Usage: <div notectl-editor [content]="content"></div>
 */
@Directive({
  selector: '[notectl-editor]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NotectlEditorDirective),
      multi: true,
    },
  ],
})
export class NotectlEditorDirective implements OnInit, OnDestroy, ControlValueAccessor {
  @Input() debug?: boolean;
  @Input() content?: string | object;
  @Input() placeholder?: string;
  @Input() readOnly?: boolean;
  @Input() accessibility?: EditorConfig['accessibility'];
  @Input() i18n?: EditorConfig['i18n'];
  @Input() theme?: EditorConfig['theme'];

  @Output() contentChange = new EventEmitter<unknown>();
  @Output() selectionChange = new EventEmitter<unknown>();
  @Output() editorFocus = new EventEmitter<void>();
  @Output() editorBlur = new EventEmitter<void>();
  @Output() ready = new EventEmitter<EditorAPI>();
  @Output() error = new EventEmitter<Error>();

  private editor: NotectlEditorCore | null = null;
  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.initEditor();
  }

  ngOnDestroy(): void {
    this.destroyEditor();
  }

  private initEditor(): void {
    const hostElement = this.elementRef.nativeElement;

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
    hostElement.appendChild(this.editor);
  }

  private destroyEditor(): void {
    if (this.editor) {
      this.editor.destroy();
      const hostElement = this.elementRef.nativeElement;
      if (hostElement.contains(this.editor)) {
        hostElement.removeChild(this.editor);
      }
      this.editor = null;
    }
  }

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
}
