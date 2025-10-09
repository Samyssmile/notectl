/**
 * React hook for using Notectl programmatically
 */

import { useEffect, useRef, useState } from 'react';
import { NotectlEditor } from '@notectl/core';
import type { EditorState, Document } from '@notectl/core';

export interface UseNotectlOptions {
  /** Initial content as HTML */
  initialContent?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Readonly mode */
  readonly?: boolean;
  /** Auto-focus on mount */
  autofocus?: boolean;
  /** On content change callback */
  onChange?: (state: EditorState) => void;
  /** On focus callback */
  onFocus?: () => void;
  /** On blur callback */
  onBlur?: () => void;
}

export interface UseNotectlReturn {
  /** Reference to the editor element */
  editorRef: React.RefObject<NotectlEditor | null>;
  /** Current editor state */
  state: EditorState | null;
  /** Get HTML content */
  getHTML: () => string;
  /** Set HTML content */
  setHTML: (html: string) => void;
  /** Get JSON document */
  getJSON: () => Document | null;
  /** Set JSON document */
  setJSON: (doc: Document) => void;
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
 * Hook for using Notectl programmatically
 */
export function useNotectl(options: UseNotectlOptions = {}): UseNotectlReturn {
  const {
    initialContent,
    placeholder,
    readonly,
    autofocus,
    onChange,
    onFocus,
    onBlur,
  } = options;

  const editorRef = useRef<NotectlEditor | null>(null);
  const [state, setState] = useState<EditorState | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

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

    // Set initial content
    if (initialContent !== undefined) {
      editor.setHTML(initialContent);
    }

    // Attach event listeners
    const handleChange = (data: any) => {
      setState(data.state);
      if (onChange) {
        onChange(data.state);
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

    // Initial state
    setState(editor.getState());

    // Cleanup
    return () => {
      editor.off('change', handleChange);
      editor.off('focus', handleFocus);
      editor.off('blur', handleBlur);
    };
  }, [initialContent, placeholder, readonly, autofocus, onChange, onFocus, onBlur]);

  const getHTML = (): string => {
    if (!editorRef.current) return '';
    return editorRef.current.getHTML();
  };

  const setHTML = (html: string): void => {
    if (!editorRef.current) return;
    editorRef.current.setHTML(html);
  };

  const getJSON = (): Document | null => {
    if (!editorRef.current) return null;
    return editorRef.current.getJSON();
  };

  const setJSON = (doc: Document): void => {
    if (!editorRef.current) return;
    editorRef.current.setJSON(doc);
  };

  const undo = (): void => {
    if (!editorRef.current) return;
    editorRef.current.undo();
  };

  const redo = (): void => {
    if (!editorRef.current) return;
    editorRef.current.redo();
  };

  const focus = (): void => {
    if (!editorRef.current) return;
    editorRef.current.focus();
  };

  const blur = (): void => {
    if (!editorRef.current) return;
    editorRef.current.blur();
  };

  return {
    editorRef,
    state,
    getHTML,
    setHTML,
    getJSON,
    setJSON,
    undo,
    redo,
    focus,
    blur,
  };
}
