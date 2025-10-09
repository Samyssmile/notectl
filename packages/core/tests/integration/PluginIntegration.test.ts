/**
 * Plugin system integration tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../../src/plugins/PluginManager';
import type { Plugin, PluginContext } from '../../src/plugins/types';
import { createMockEditorAPI } from '../fixtures/mocks';

describe('Plugin System Integration', () => {
  let manager: PluginManager;
  let mockEditor: ReturnType<typeof createMockEditorAPI>;

  beforeEach(() => {
    mockEditor = createMockEditorAPI();
    manager = new PluginManager(mockEditor);
  });

  describe('plugin workflow', () => {
    it('should complete full plugin lifecycle', async () => {
      const initSpy = vi.fn();
      const destroySpy = vi.fn();

      const plugin: Plugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        init: initSpy,
        destroy: destroySpy,
      };

      // Register
      await manager.registerPlugin(plugin);
      expect(initSpy).toHaveBeenCalled();
      expect(manager.getPlugin('test-plugin')).toBe(plugin);

      // Unregister
      await manager.unregisterPlugin('test-plugin');
      expect(destroySpy).toHaveBeenCalled();
      expect(manager.getPlugin('test-plugin')).toBeUndefined();
    });

    it('should register multiple plugins with dependencies', async () => {
      const basePlugin: Plugin = {
        id: 'base',
        name: 'Base Plugin',
        version: '1.0.0',
        init: async () => {},
      };

      const extendedPlugin: Plugin = {
        id: 'extended',
        name: 'Extended Plugin',
        version: '1.0.0',
        dependencies: ['base'],
        init: async () => {},
      };

      const advancedPlugin: Plugin = {
        id: 'advanced',
        name: 'Advanced Plugin',
        version: '1.0.0',
        dependencies: ['extended'],
        init: async () => {},
      };

      // Register in correct order
      await manager.registerPlugin(basePlugin);
      await manager.registerPlugin(extendedPlugin);
      await manager.registerPlugin(advancedPlugin);

      expect(manager.getAllPlugins()).toHaveLength(3);
    });

    it('should fail when registering plugins out of order', async () => {
      const basePlugin: Plugin = {
        id: 'base',
        name: 'Base Plugin',
        version: '1.0.0',
        init: async () => {},
      };

      const dependentPlugin: Plugin = {
        id: 'dependent',
        name: 'Dependent Plugin',
        version: '1.0.0',
        dependencies: ['base'],
        init: async () => {},
      };

      // Try to register dependent before base
      await expect(manager.registerPlugin(dependentPlugin)).rejects.toThrow();

      // Register in correct order should work
      await manager.registerPlugin(basePlugin);
      await expect(manager.registerPlugin(dependentPlugin)).resolves.not.toThrow();
    });
  });

  describe('operations registration', () => {
    it('should allow plugins to register operations', async () => {
      const operationSpy = vi.fn();

      const plugin: Plugin = {
        id: 'operation-plugin',
        name: 'Operation Plugin',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.registerOperation({
            type: 'custom_op',
            apply: operationSpy,
            invert: vi.fn(),
            transform: vi.fn(),
          });
        },
      };

      await manager.registerPlugin(plugin);

      const operation = manager.getOperation('custom_op');
      expect(operation).toBeDefined();
      expect(operation?.type).toBe('custom_op');
    });

    it('should prevent duplicate operation registration', async () => {
      const plugin1: Plugin = {
        id: 'plugin-1',
        name: 'Plugin 1',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.registerOperation({
            type: 'shared_op',
            apply: vi.fn(),
            invert: vi.fn(),
            transform: vi.fn(),
          });
        },
      };

      const plugin2: Plugin = {
        id: 'plugin-2',
        name: 'Plugin 2',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.registerOperation({
            type: 'shared_op',
            apply: vi.fn(),
            invert: vi.fn(),
            transform: vi.fn(),
          });
        },
      };

      await manager.registerPlugin(plugin1);
      await expect(manager.registerPlugin(plugin2)).rejects.toThrow();
    });
  });

  describe('command registration and execution', () => {
    it('should allow plugins to register and execute commands', async () => {
      const commandHandler = vi.fn();

      const plugin: Plugin = {
        id: 'command-plugin',
        name: 'Command Plugin',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.registerCommand('test-command', commandHandler);
        },
      };

      await manager.registerPlugin(plugin);
      await manager.executeCommand('test-command', 'arg1', 'arg2');

      expect(commandHandler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should handle command failures gracefully', async () => {
      const failingCommand = vi.fn(() => {
        throw new Error('Command failed');
      });

      const plugin: Plugin = {
        id: 'failing-plugin',
        name: 'Failing Plugin',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.registerCommand('failing-command', failingCommand);
        },
      };

      await manager.registerPlugin(plugin);
      await expect(manager.executeCommand('failing-command')).rejects.toThrow('Command failed');
    });
  });

  describe('event system integration', () => {
    it('should allow plugins to emit and listen to events', async () => {
      const listener = vi.fn();

      const emitterPlugin: Plugin = {
        id: 'emitter',
        name: 'Emitter Plugin',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          // Emit event after initialization
          setTimeout(() => context.emit('custom-event', 'data'), 0);
        },
      };

      const listenerPlugin: Plugin = {
        id: 'listener',
        name: 'Listener Plugin',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.on('custom-event', listener);
        },
      };

      await manager.registerPlugin(listenerPlugin);
      await manager.registerPlugin(emitterPlugin);

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledWith('data');
    });

    it('should remove event listeners when plugin is unregistered', async () => {
      const listener = vi.fn();

      const plugin: Plugin = {
        id: 'event-plugin',
        name: 'Event Plugin',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.on('test-event', listener);
        },
      };

      await manager.registerPlugin(plugin);
      manager.emit('test-event', 'before');
      expect(listener).toHaveBeenCalledWith('before');

      await manager.unregisterPlugin('event-plugin');
      listener.mockClear();

      manager.emit('test-event', 'after');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers to same event', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const plugin1: Plugin = {
        id: 'plugin-1',
        name: 'Plugin 1',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.on('shared-event', listener1);
        },
      };

      const plugin2: Plugin = {
        id: 'plugin-2',
        name: 'Plugin 2',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.on('shared-event', listener2);
        },
      };

      await manager.registerPlugin(plugin1);
      await manager.registerPlugin(plugin2);

      manager.emit('shared-event', 'data');

      expect(listener1).toHaveBeenCalledWith('data');
      expect(listener2).toHaveBeenCalledWith('data');
    });
  });

  describe('plugin coordination', () => {
    it('should allow plugins to interact through shared state', async () => {
      const sharedState: { value?: string } = {};

      const writerPlugin: Plugin = {
        id: 'writer',
        name: 'Writer Plugin',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.registerCommand('write', async (value: string) => {
            sharedState.value = value;
            context.emit('state-changed', value);
          });
        },
      };

      const readerPlugin: Plugin = {
        id: 'reader',
        name: 'Reader Plugin',
        version: '1.0.0',
        init: async (context: PluginContext) => {
          context.on('state-changed', (value: string) => {
            expect(sharedState.value).toBe(value);
          });
        },
      };

      await manager.registerPlugin(writerPlugin);
      await manager.registerPlugin(readerPlugin);

      await manager.executeCommand('write', 'test-value');
    });

    it('should handle plugin cleanup properly', async () => {
      const resources: string[] = [];

      const plugin: Plugin = {
        id: 'resource-plugin',
        name: 'Resource Plugin',
        version: '1.0.0',
        init: async () => {
          resources.push('resource-1');
          resources.push('resource-2');
        },
        destroy: async () => {
          resources.length = 0;
        },
      };

      await manager.registerPlugin(plugin);
      expect(resources).toHaveLength(2);

      await manager.unregisterPlugin('resource-plugin');
      expect(resources).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle plugin initialization errors', async () => {
      const plugin: Plugin = {
        id: 'error-plugin',
        name: 'Error Plugin',
        version: '1.0.0',
        init: async () => {
          throw new Error('Initialization failed');
        },
      };

      await expect(manager.registerPlugin(plugin)).rejects.toThrow('Initialization failed');
      expect(manager.getPlugin('error-plugin')).toBeUndefined();
    });

    it('should handle plugin destroy errors gracefully', async () => {
      const plugin: Plugin = {
        id: 'cleanup-error-plugin',
        name: 'Cleanup Error Plugin',
        version: '1.0.0',
        init: async () => {},
        destroy: async () => {
          throw new Error('Cleanup failed');
        },
      };

      await manager.registerPlugin(plugin);
      await expect(manager.unregisterPlugin('cleanup-error-plugin')).rejects.toThrow('Cleanup failed');
    });
  });

  describe('manager cleanup', () => {
    it('should destroy all plugins on manager destroy', async () => {
      const destroy1 = vi.fn();
      const destroy2 = vi.fn();

      await manager.registerPlugin({
        id: 'plugin-1',
        name: 'Plugin 1',
        version: '1.0.0',
        init: async () => {},
        destroy: destroy1,
      });

      await manager.registerPlugin({
        id: 'plugin-2',
        name: 'Plugin 2',
        version: '1.0.0',
        init: async () => {},
        destroy: destroy2,
      });

      await manager.destroy();

      expect(destroy1).toHaveBeenCalled();
      expect(destroy2).toHaveBeenCalled();
      expect(manager.getAllPlugins()).toEqual([]);
    });
  });
});
