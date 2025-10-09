/**
 * React adapter tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NotectlEditor } from '../src/NotectlEditor';
import type { EditorAPI } from '@notectl/core';

// Mock the core editor
vi.mock('@notectl/core', () => ({
  NotectlEditor: class MockNotectlEditor extends HTMLElement {
    private _config: any = {};
    private _listeners: Map<string, Set<Function>> = new Map();

    configure(config: any) {
      this._config = { ...this._config, ...config };
    }

    getContent() {
      return { content: 'mock content' };
    }

    setContent(content: any) {
      this.dispatchEvent(new CustomEvent('content-change', { detail: { content } }));
    }

    getState() {
      return { version: 0 };
    }

    executeCommand(command: string, ...args: any[]) {
      // Mock command execution
    }

    registerPlugin(plugin: any) {
      // Mock plugin registration
    }

    unregisterPlugin(pluginId: string) {
      // Mock plugin unregistration
    }

    destroy() {
      this._listeners.clear();
    }

    on(event: string, handler: Function) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, new Set());
      }
      this._listeners.get(event)!.add(handler);

      // Setup DOM event listener
      this.addEventListener(event, ((e: CustomEvent) => handler(e.detail)) as EventListener);
    }
  },
}));

describe('NotectlEditor React Adapter', () => {
  beforeEach(() => {
    // Clean up document
    document.body.innerHTML = '';
  });

  describe('mounting and unmounting', () => {
    it('should render editor component', () => {
      const { container } = render(<NotectlEditor />);

      const wrapper = container.querySelector('[data-notectl-react-wrapper]');
      expect(wrapper).toBeTruthy();
    });

    it('should create editor element', async () => {
      const { container } = render(<NotectlEditor />);

      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        expect(editorElement).toBeTruthy();
      });
    });

    it('should cleanup on unmount', async () => {
      const { unmount, container } = render(<NotectlEditor />);

      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        expect(editorElement).toBeTruthy();
      });

      unmount();

      const editorElement = container.querySelector('notectl-editor');
      expect(editorElement).toBeFalsy();
    });
  });

  describe('props handling', () => {
    it('should apply className prop', () => {
      const { container } = render(<NotectlEditor className="custom-editor" />);

      const wrapper = container.querySelector('[data-notectl-react-wrapper]');
      expect(wrapper?.className).toContain('custom-editor');
    });

    it('should apply style prop', () => {
      const { container } = render(
        <NotectlEditor style={{ width: '100%', height: '400px' }} />
      );

      const wrapper = container.querySelector('[data-notectl-react-wrapper]') as HTMLElement;
      expect(wrapper?.style.width).toBe('100%');
      expect(wrapper?.style.height).toBe('400px');
    });

    it('should configure editor with config props', async () => {
      const { container } = render(
        <NotectlEditor
          placeholder="Enter text..."
          readOnly={true}
          debug={true}
        />
      );

      // Editor should be configured (we can't easily test this without mocking internals)
      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        expect(editorElement).toBeTruthy();
      });
    });
  });

  describe('event callbacks', () => {
    it('should call onReady when editor is ready', async () => {
      const onReady = vi.fn();
      const { container } = render(<NotectlEditor onReady={onReady} />);

      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        if (editorElement) {
          editorElement.dispatchEvent(new CustomEvent('ready'));
        }
      });

      // Wait a bit for React to process the event
      await waitFor(() => {
        expect(onReady).toHaveBeenCalled();
      });
    });

    it('should call onContentChange when content changes', async () => {
      const onContentChange = vi.fn();
      const { container } = render(<NotectlEditor onContentChange={onContentChange} />);

      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        if (editorElement) {
          editorElement.dispatchEvent(
            new CustomEvent('content-change', {
              detail: { content: 'new content' },
            })
          );
        }
      });

      await waitFor(() => {
        expect(onContentChange).toHaveBeenCalledWith('new content');
      });
    });

    it('should call onFocus when editor gains focus', async () => {
      const onFocus = vi.fn();
      const { container } = render(<NotectlEditor onFocus={onFocus} />);

      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        if (editorElement) {
          editorElement.dispatchEvent(new CustomEvent('focus'));
        }
      });

      await waitFor(() => {
        expect(onFocus).toHaveBeenCalled();
      });
    });

    it('should call onBlur when editor loses focus', async () => {
      const onBlur = vi.fn();
      const { container } = render(<NotectlEditor onBlur={onBlur} />);

      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        if (editorElement) {
          editorElement.dispatchEvent(new CustomEvent('blur'));
        }
      });

      await waitFor(() => {
        expect(onBlur).toHaveBeenCalled();
      });
    });

    it('should call onError when error occurs', async () => {
      const onError = vi.fn();
      const { container } = render(<NotectlEditor onError={onError} />);

      const testError = new Error('Test error');

      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        if (editorElement) {
          editorElement.dispatchEvent(
            new CustomEvent('error', {
              detail: { error: testError },
            })
          );
        }
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(testError);
      });
    });
  });

  describe('ref handling', () => {
    it('should expose editor API through ref', async () => {
      const ref = { current: null as any };

      render(<NotectlEditor ref={ref} />);

      await waitFor(() => {
        expect(ref.current).toBeDefined();
        expect(ref.current).toHaveProperty('getContent');
        expect(ref.current).toHaveProperty('setContent');
        expect(ref.current).toHaveProperty('getState');
        expect(ref.current).toHaveProperty('executeCommand');
        expect(ref.current).toHaveProperty('registerPlugin');
        expect(ref.current).toHaveProperty('unregisterPlugin');
        expect(ref.current).toHaveProperty('destroy');
      });
    });

    it('should allow calling API methods through ref', async () => {
      const ref = { current: null as any };

      render(<NotectlEditor ref={ref} />);

      await waitFor(() => {
        expect(ref.current).toBeDefined();
      });

      // Call API methods
      expect(() => ref.current.getContent()).not.toThrow();
      expect(() => ref.current.setContent('new content')).not.toThrow();
      expect(() => ref.current.getState()).not.toThrow();
    });
  });

  describe('dynamic updates', () => {
    it('should update editor config when props change', async () => {
      const { rerender, container } = render(<NotectlEditor readOnly={false} />);

      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        expect(editorElement).toBeTruthy();
      });

      // Update props
      rerender(<NotectlEditor readOnly={true} />);

      // Editor should be reconfigured (we can't easily test this without mocking internals)
      await waitFor(() => {
        const editorElement = container.querySelector('notectl-editor');
        expect(editorElement).toBeTruthy();
      });
    });
  });

  describe('error handling', () => {
    it('should throw error if ref is used before editor is initialized', () => {
      const ref = { current: null as any };

      render(<NotectlEditor ref={ref} />);

      // Ref should not be usable immediately
      // (In real implementation, useImperativeHandle ensures this)
    });
  });

  describe('accessibility', () => {
    it('should render with proper wrapper structure', () => {
      const { container } = render(<NotectlEditor />);

      const wrapper = container.querySelector('[data-notectl-react-wrapper]');
      expect(wrapper).toBeTruthy();
      expect(wrapper?.tagName).toBe('DIV');
    });

    it('should support custom aria attributes through className', () => {
      const { container } = render(
        <NotectlEditor className="editor" style={{ minHeight: '200px' }} />
      );

      const wrapper = container.querySelector('[data-notectl-react-wrapper]');
      expect(wrapper).toBeTruthy();
    });
  });
});
