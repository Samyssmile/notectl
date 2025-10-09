/**
 * Vue adapter test setup
 */

import { afterEach, vi } from 'vitest';
import { config } from '@vue/test-utils';

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock Web Components API
if (typeof customElements === 'undefined') {
  (global as any).customElements = {
    define: vi.fn(),
    get: vi.fn(),
    whenDefined: vi.fn(() => Promise.resolve()),
  };
}

// Polyfill for CustomEvent if needed
if (typeof CustomEvent === 'undefined') {
  (global as any).CustomEvent = class CustomEvent extends Event {
    detail: any;
    constructor(event: string, params?: any) {
      super(event, params);
      this.detail = params?.detail;
    }
  };
}

// Configure Vue Test Utils
config.global.stubs = {
  // Add any global stubs if needed
};
