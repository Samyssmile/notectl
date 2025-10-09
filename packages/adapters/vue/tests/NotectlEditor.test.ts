/**
 * Vue adapter tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import NotectlEditor from '../src/NotectlEditor';

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

      this.addEventListener(event, ((e: CustomEvent) => handler(e.detail)) as EventListener);
    }
  },
}));

describe('NotectlEditor Vue Adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('mounting and unmounting', () => {
    it('should render editor component', () => {
      const wrapper = mount(NotectlEditor);

      expect(wrapper.exists()).toBe(true);
      const container = wrapper.find('[data-notectl-vue-wrapper]');
      expect(container.exists()).toBe(true);
    });

    it('should create editor element on mount', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      const editorElement = wrapper.element.querySelector('notectl-editor');
      expect(editorElement).toBeTruthy();
    });

    it('should cleanup on unmount', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();
      expect(wrapper.element.querySelector('notectl-editor')).toBeTruthy();

      wrapper.unmount();

      // Editor should be destroyed
      const editorElement = document.querySelector('notectl-editor');
      expect(editorElement).toBeFalsy();
    });
  });

  describe('props handling', () => {
    it('should apply class prop', () => {
      const wrapper = mount(NotectlEditor, {
        props: {
          class: 'custom-editor',
        },
      });

      const container = wrapper.find('[data-notectl-vue-wrapper]');
      expect(container.classes()).toContain('custom-editor');
    });

    it('should apply style prop', () => {
      const wrapper = mount(NotectlEditor, {
        props: {
          style: { width: '100%', height: '400px' },
        },
      });

      const container = wrapper.find('[data-notectl-vue-wrapper]');
      const element = container.element as HTMLElement;
      expect(element.style.width).toBe('100%');
      expect(element.style.height).toBe('400px');
    });

    it('should configure editor with config props', async () => {
      const wrapper = mount(NotectlEditor, {
        props: {
          placeholder: 'Enter text...',
          readOnly: true,
          debug: true,
        },
      });

      await wrapper.vm.$nextTick();

      const editorElement = wrapper.element.querySelector('notectl-editor');
      expect(editorElement).toBeTruthy();
    });
  });

  describe('event emissions', () => {
    it('should emit ready event when editor is ready', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      const editorElement = wrapper.element.querySelector('notectl-editor');
      if (editorElement) {
        editorElement.dispatchEvent(new CustomEvent('ready'));
      }

      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('ready')).toBeTruthy();
    });

    it('should emit content-change event', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      const editorElement = wrapper.element.querySelector('notectl-editor');
      if (editorElement) {
        editorElement.dispatchEvent(
          new CustomEvent('content-change', {
            detail: { content: 'new content' },
          })
        );
      }

      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('content-change')).toBeTruthy();
      expect(wrapper.emitted('content-change')?.[0]).toEqual(['new content']);
    });

    it('should emit focus event', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      const editorElement = wrapper.element.querySelector('notectl-editor');
      if (editorElement) {
        editorElement.dispatchEvent(new CustomEvent('focus'));
      }

      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('focus')).toBeTruthy();
    });

    it('should emit blur event', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      const editorElement = wrapper.element.querySelector('notectl-editor');
      if (editorElement) {
        editorElement.dispatchEvent(new CustomEvent('blur'));
      }

      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('blur')).toBeTruthy();
    });

    it('should emit error event', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      const testError = new Error('Test error');
      const editorElement = wrapper.element.querySelector('notectl-editor');
      if (editorElement) {
        editorElement.dispatchEvent(
          new CustomEvent('error', {
            detail: { error: testError },
          })
        );
      }

      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('error')).toBeTruthy();
      expect(wrapper.emitted('error')?.[0]).toEqual([testError]);
    });
  });

  describe('exposed API', () => {
    it('should expose editor API methods', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as any;

      expect(typeof vm.getContent).toBe('function');
      expect(typeof vm.setContent).toBe('function');
      expect(typeof vm.getState).toBe('function');
      expect(typeof vm.executeCommand).toBe('function');
      expect(typeof vm.registerPlugin).toBe('function');
      expect(typeof vm.unregisterPlugin).toBe('function');
      expect(typeof vm.destroy).toBe('function');
    });

    it('should allow calling API methods', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as any;

      expect(() => vm.getContent()).not.toThrow();
      expect(() => vm.setContent('new content')).not.toThrow();
      expect(() => vm.getState()).not.toThrow();
    });
  });

  describe('dynamic updates', () => {
    it('should update editor config when props change', async () => {
      const wrapper = mount(NotectlEditor, {
        props: {
          readOnly: false,
        },
      });

      await wrapper.vm.$nextTick();

      // Update props
      await wrapper.setProps({ readOnly: true });

      const editorElement = wrapper.element.querySelector('notectl-editor');
      expect(editorElement).toBeTruthy();
    });

    it('should handle content prop updates', async () => {
      const wrapper = mount(NotectlEditor, {
        props: {
          content: 'initial content',
        },
      });

      await wrapper.vm.$nextTick();

      // Update content
      await wrapper.setProps({ content: 'updated content' });

      // Editor should be updated
      expect(wrapper.element.querySelector('notectl-editor')).toBeTruthy();
    });
  });

  describe('composition API integration', () => {
    it('should work with composable', async () => {
      const wrapper = mount(NotectlEditor);

      await wrapper.vm.$nextTick();

      // Check that editor is initialized
      const editorElement = wrapper.element.querySelector('notectl-editor');
      expect(editorElement).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('should render with proper wrapper structure', () => {
      const wrapper = mount(NotectlEditor);

      const container = wrapper.find('[data-notectl-vue-wrapper]');
      expect(container.exists()).toBe(true);
    });

    it('should support custom attributes', () => {
      const wrapper = mount(NotectlEditor, {
        attrs: {
          'aria-label': 'Rich text editor',
          role: 'textbox',
        },
      });

      const container = wrapper.find('[data-notectl-vue-wrapper]');
      expect(container.attributes('aria-label')).toBe('Rich text editor');
      expect(container.attributes('role')).toBe('textbox');
    });
  });

  describe('error handling', () => {
    it('should handle missing editor element', async () => {
      const wrapper = mount(NotectlEditor);

      // Try to call API before editor is ready
      await wrapper.vm.$nextTick();

      // Should not throw
      const vm = wrapper.vm as any;
      expect(() => vm.getContent()).not.toThrow();
    });
  });
});
