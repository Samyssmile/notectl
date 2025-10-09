/**
 * Test setup and global configuration
 */

import { vi } from 'vitest';

// Mock crypto.randomUUID for Node environments that don't have it
if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  global.crypto = {
    randomUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },
  } as Crypto;
}

// Mock HTMLElement for Web Components testing
if (typeof HTMLElement === 'undefined') {
  global.HTMLElement = class {} as any;
}

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
