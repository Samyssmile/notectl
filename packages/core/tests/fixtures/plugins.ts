/**
 * Test fixtures for plugins
 */

import type { Plugin, PluginContext } from '../../src/plugins/types';

/**
 * Create a mock plugin
 */
export const createMockPlugin = (
  id: string = 'test-plugin',
  overrides?: Partial<Plugin>
): Plugin => ({
  id,
  name: 'Test Plugin',
  version: '1.0.0',
  init: async (context: PluginContext) => {},
  ...overrides,
});

/**
 * Simple plugin with no dependencies
 */
export const simplePlugin: Plugin = {
  id: 'simple-plugin',
  name: 'Simple Plugin',
  version: '1.0.0',
  init: async (context: PluginContext) => {
    context.registerCommand('test-command', async () => {
      console.log('Test command executed');
    });
  },
};

/**
 * Plugin with dependencies
 */
export const dependentPlugin: Plugin = {
  id: 'dependent-plugin',
  name: 'Dependent Plugin',
  version: '1.0.0',
  dependencies: ['simple-plugin'],
  init: async (context: PluginContext) => {},
};

/**
 * Plugin with destroy lifecycle
 */
export const lifecyclePlugin: Plugin = {
  id: 'lifecycle-plugin',
  name: 'Lifecycle Plugin',
  version: '1.0.0',
  init: async (context: PluginContext) => {
    // Setup
  },
  destroy: async () => {
    // Cleanup
  },
};

/**
 * Plugin that registers operations
 */
export const operationPlugin: Plugin = {
  id: 'operation-plugin',
  name: 'Operation Plugin',
  version: '1.0.0',
  init: async (context: PluginContext) => {
    context.registerOperation({
      type: 'custom_op',
      apply: (state, op) => state,
      invert: (op) => op,
      transform: (op1, op2, priority) => op1,
    });
  },
};

/**
 * Plugin that listens to events
 */
export const eventPlugin: Plugin = {
  id: 'event-plugin',
  name: 'Event Plugin',
  version: '1.0.0',
  init: async (context: PluginContext) => {
    context.on('content-change', (data) => {
      console.log('Content changed:', data);
    });
  },
};
