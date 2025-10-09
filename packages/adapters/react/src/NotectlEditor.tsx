/**
 * React component wrapper for NotectlEditor
 */

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { NotectlEditor as NotectlEditorCore } from '@notectl/core';
import type { Document, EditorState } from '@notectl/core';

export interface NotectlEditorProps {
  /** Custom class name */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
  /** On content change callback */
  onContentChange?: (state: EditorState) => void;
  /** On focus callback */
  onFocus?: () => void;
  /** On blur callback */
  onBlur?: () => void;
  /** Initial content as HTML */
  initialContent?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Readonly mode */
  readonly?: boolean;
  /** Auto-focus on mount */
  autofocus?: boolean;
}

export interface NotectlEditorHandle {
  /** Get current editor state */
  getState: () => EditorState;
  /** Get document as JSON */
  getJSON: () => Document;
  /** Set document from JSON */
  setJSON: (doc: Document) => void;
  /** Get HTML content */
  getHTML: () => string;
  /** Set HTML content */
  setHTML: (html: string) => void;
  /** Set content from string */
  setContent: (content: string, allowHTML?: boolean) => void;
  /** Undo last change */
  undo: () => void;
  /** Redo last undone change */
  redo: () => void;
  /** Focus the editor */
  focus: () => void;
  /** Blur the editor */
  blur: () => void;
}

/**
 * NotectlEditor React component
 */
export const NotectlEditor = forwardRef<NotectlEditorHandle, NotectlEditorProps>(
  (props, ref) => {
    const {
      className,
      style,
      onContentChange,
      onFocus,
      onBlur,
      initialContent,
      placeholder,
      readonly,
      autofocus,
    } = props;

    const editorRef = useRef<NotectlEditorCore | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Expose editor API to parent via ref
    useImperativeHandle(ref, () => {
      const editor = editorRef.current;
      if (!editor) {
        throw new Error('Editor not initialized');
      }
      return {
        getState: () => editor.getState(),
        getJSON: () => editor.getJSON(),
        setJSON: (doc: Document) => editor.setJSON(doc),
        getHTML: () => editor.getHTML(),
        setHTML: (html: string) => editor.setHTML(html),
        setContent: (content: string, allowHTML?: boolean) => editor.setContent(content, allowHTML),
        undo: () => editor.undo(),
        redo: () => editor.redo(),
        focus: () => editor.focus(),
        blur: () => editor.blur(),
      };
    }, []);

    useEffect(() => {
      if (!containerRef.current) return;

      // Create editor instance
      const editor = document.createElement('notectl-editor') as NotectlEditorCore;
      editorRef.current = editor;

      // Set attributes
      if (placeholder !== undefined) {
        editor.setAttribute('placeholder', placeholder);
      }
      if (readonly !== undefined && readonly) {
        editor.setAttribute('readonly', '');
      }
      if (autofocus !== undefined && autofocus) {
        editor.setAttribute('autofocus', '');
      }

      // Set initial content if provided
      if (initialContent !== undefined) {
        editor.setHTML(initialContent);
      }

      // Attach event listeners
      const handleChange = (data: any) => {
        if (onContentChange) {
          onContentChange(data.state);
        }
      };
      const handleFocus = () => {
        if (onFocus) {
          onFocus();
        }
      };
      const handleBlur = () => {
        if (onBlur) {
          onBlur();
        }
      };

      editor.on('change', handleChange);
      editor.on('focus', handleFocus);
      editor.on('blur', handleBlur);

      // Mount editor
      containerRef.current.appendChild(editor);

      // Cleanup
      return () => {
        if (containerRef.current?.contains(editor)) {
          containerRef.current.removeChild(editor);
        }
        editorRef.current = null;
      };
    }, []);

    // Update placeholder when it changes
    useEffect(() => {
      if (editorRef.current && placeholder !== undefined) {
        editorRef.current.setAttribute('placeholder', placeholder);
      }
    }, [placeholder]);

    // Update readonly when it changes
    useEffect(() => {
      if (editorRef.current && readonly !== undefined) {
        if (readonly) {
          editorRef.current.setAttribute('readonly', '');
        } else {
          editorRef.current.removeAttribute('readonly');
        }
      }
    }, [readonly]);

    return (
      <div
        ref={containerRef}
        className={className as string | undefined}
        style={style as React.CSSProperties | undefined}
        data-notectl-react-wrapper
      />
    );
  }
);

NotectlEditor.displayName = 'NotectlEditor';
