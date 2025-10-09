/**
 * Mock implementations for testing
 */

import { vi } from 'vitest';
import type { EditorAPI } from '../../src/types';

/**
 * Create a mock EditorAPI instance
 */
export const createMockEditorAPI = (): EditorAPI => ({
  getContent: vi.fn(() => ({})),
  setContent: vi.fn(),
  getState: vi.fn(() => ({})),
  executeCommand: vi.fn(),
  registerPlugin: vi.fn(),
  unregisterPlugin: vi.fn(),
  destroy: vi.fn(),
});

/**
 * Create a mock HTMLElement for Web Components
 */
export const createMockElement = (tagName: string = 'div'): HTMLElement => {
  const element = document.createElement(tagName);

  // Add Web Component lifecycle mocks
  (element as any).connectedCallback = vi.fn();
  (element as any).disconnectedCallback = vi.fn();
  (element as any).attributeChangedCallback = vi.fn();
  (element as any).adoptedCallback = vi.fn();

  return element;
};

/**
 * Create a mock event
 */
export const createMockEvent = (
  type: string,
  options: EventInit = {}
): Event => {
  return new Event(type, options);
};

/**
 * Create a mock keyboard event
 */
export const createMockKeyboardEvent = (
  key: string,
  options: KeyboardEventInit = {}
): KeyboardEvent => {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...options,
  });
};

/**
 * Create a mock mouse event
 */
export const createMockMouseEvent = (
  type: string,
  options: MouseEventInit = {}
): MouseEvent => {
  return new MouseEvent(type, {
    bubbles: true,
    ...options,
  });
};

/**
 * Wait for next tick
 */
export const nextTick = (): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * Wait for condition to be true
 */
export const waitFor = async (
  condition: () => boolean,
  timeout: number = 1000,
  interval: number = 50
): Promise<void> => {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

/**
 * Mock localStorage
 */
export const createMockLocalStorage = (): Storage => {
  const store: Record<string, string> = {};

  return {
    length: Object.keys(store).length,
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    getItem: vi.fn((key: string) => store[key] || null),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
  };
};
