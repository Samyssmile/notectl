/**
 * PluginManager unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../../../src/plugins/PluginManager';
import type { EditorAPI } from '../../../src/types';
import {
  simplePlugin,
  dependentPlugin,
  lifecyclePlugin,
  operationPlugin,
  createMockPlugin,
} from '../../fixtures/plugins';

describe('PluginManager', () => {
  let manager: PluginManager;
  let mockEditor: EditorAPI;

  beforeEach(() => {
    mockEditor = {
      getContent: vi.fn(),
      setContent: vi.fn(),
      getState: vi.fn(),
      executeCommand: vi.fn(),
      registerPlugin: vi.fn(),
      unregisterPlugin: vi.fn(),
      destroy: vi.fn(),
    };
    manager = new PluginManager(mockEditor);
  });

  describe('registerPlugin', () => {
    it('should register a plugin successfully', async () => {
      const plugin = createMockPlugin('test-plugin');
      await manager.registerPlugin(plugin);

      expect(manager.getPlugin('test-plugin')).toBe(plugin);
    });

    it('should throw error when registering duplicate plugin', async () => {
      const plugin = createMockPlugin('test-plugin');
      await manager.registerPlugin(plugin);

      await expect(manager.registerPlugin(plugin)).rejects.toThrow(
        'Plugin test-plugin is already registered'
      );
    });

    it('should call plugin init with context', async () => {
      const initSpy = vi.fn();
      const plugin = createMockPlugin('test-plugin', {
        init: initSpy,
      });

      await manager.registerPlugin(plugin);

      expect(initSpy).toHaveBeenCalledOnce();
      expect(initSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          editor: mockEditor,
          registerOperation: expect.any(Function),
          registerCommand: expect.any(Function),
          on: expect.any(Function),
          off: expect.any(Function),
          emit: expect.any(Function),
        })
      );
    });

    it('should enforce plugin dependencies', async () => {
      await expect(manager.registerPlugin(dependentPlugin)).rejects.toThrow(
        'Plugin dependent-plugin depends on simple-plugin which is not registered'
      );
    });

    it('should allow plugin registration after dependencies', async () => {
      await manager.registerPlugin(simplePlugin);
      await expect(manager.registerPlugin(dependentPlugin)).resolves.not.toThrow();
    });
  });

  describe('unregisterPlugin', () => {
    it('should unregister a plugin successfully', async () => {
      const plugin = createMockPlugin('test-plugin');
      await manager.registerPlugin(plugin);
      await manager.unregisterPlugin('test-plugin');

      expect(manager.getPlugin('test-plugin')).toBeUndefined();
    });

    it('should throw error when unregistering non-existent plugin', async () => {
      await expect(manager.unregisterPlugin('non-existent')).rejects.toThrow(
        'Plugin non-existent is not registered'
      );
    });

    it('should call plugin destroy if defined', async () => {
      const destroySpy = vi.fn();
      const plugin = createMockPlugin('test-plugin', {
        destroy: destroySpy,
      });

      await manager.registerPlugin(plugin);
      await manager.unregisterPlugin('test-plugin');

      expect(destroySpy).toHaveBeenCalledOnce();
    });

    it('should prevent unregistering plugin with dependents', async () => {
      await manager.registerPlugin(simplePlugin);
      await manager.registerPlugin(dependentPlugin);

      await expect(manager.unregisterPlugin('simple-plugin')).rejects.toThrow(
        'Cannot unregister simple-plugin because dependent-plugin depends on it'
      );
    });
  });

  describe('getPlugin', () => {
    it('should return registered plugin', async () => {
      const plugin = createMockPlugin('test-plugin');
      await manager.registerPlugin(plugin);

      expect(manager.getPlugin('test-plugin')).toBe(plugin);
    });

    it('should return undefined for non-existent plugin', () => {
      expect(manager.getPlugin('non-existent')).toBeUndefined();
    });
  });

  describe('getAllPlugins', () => {
    it('should return empty array when no plugins registered', () => {
      expect(manager.getAllPlugins()).toEqual([]);
    });

    it('should return all registered plugins', async () => {
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');

      await manager.registerPlugin(plugin1);
      await manager.registerPlugin(plugin2);

      const plugins = manager.getAllPlugins();
      expect(plugins).toHaveLength(2);
      expect(plugins).toContain(plugin1);
      expect(plugins).toContain(plugin2);
    });
  });

  describe('registerOperation', () => {
    it('should register operation definition', () => {
      const operation = {
        type: 'custom_op',
        apply: vi.fn(),
        invert: vi.fn(),
        transform: vi.fn(),
      };

      manager.registerOperation(operation);
      expect(manager.getOperation('custom_op')).toBe(operation);
    });

    it('should throw error when registering duplicate operation', () => {
      const operation = {
        type: 'custom_op',
        apply: vi.fn(),
        invert: vi.fn(),
        transform: vi.fn(),
      };

      manager.registerOperation(operation);
      expect(() => manager.registerOperation(operation)).toThrow(
        'Operation custom_op is already registered'
      );
    });
  });

  describe('registerCommand', () => {
    it('should register command handler', () => {
      const handler = vi.fn();
      manager.registerCommand('test-command', handler);
    });

    it('should throw error when registering duplicate command', () => {
      const handler = vi.fn();
      manager.registerCommand('test-command', handler);

      expect(() => manager.registerCommand('test-command', handler)).toThrow(
        'Command test-command is already registered'
      );
    });
  });

  describe('executeCommand', () => {
    it('should execute registered command', async () => {
      const handler = vi.fn();
      manager.registerCommand('test-command', handler);

      await manager.executeCommand('test-command', 'arg1', 'arg2');

      expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should throw error when executing non-existent command', async () => {
      await expect(manager.executeCommand('non-existent')).rejects.toThrow(
        'Command non-existent is not registered'
      );
    });

    it('should handle async command handlers', async () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result';
      });

      manager.registerCommand('async-command', handler);
      await manager.executeCommand('async-command');

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('event system', () => {
    it('should subscribe to events', () => {
      const handler = vi.fn();
      manager.on('test-event', handler);

      manager.emit('test-event', 'arg1', 'arg2');

      expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should support multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      manager.on('test-event', handler1);
      manager.on('test-event', handler2);

      manager.emit('test-event', 'data');

      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).toHaveBeenCalledWith('data');
    });

    it('should unsubscribe from events', () => {
      const handler = vi.fn();
      manager.on('test-event', handler);
      manager.off('test-event', handler);

      manager.emit('test-event');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle unsubscribing non-existent handlers', () => {
      const handler = vi.fn();
      expect(() => manager.off('test-event', handler)).not.toThrow();
    });

    it('should not call handler after unsubscribe', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      manager.on('test-event', handler1);
      manager.on('test-event', handler2);
      manager.off('test-event', handler1);

      manager.emit('test-event');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });

  describe('destroy', () => {
    it('should destroy all plugins', async () => {
      const destroy1 = vi.fn();
      const destroy2 = vi.fn();

      const plugin1 = createMockPlugin('plugin-1', { destroy: destroy1 });
      const plugin2 = createMockPlugin('plugin-2', { destroy: destroy2 });

      await manager.registerPlugin(plugin1);
      await manager.registerPlugin(plugin2);

      await manager.destroy();

      expect(destroy1).toHaveBeenCalledOnce();
      expect(destroy2).toHaveBeenCalledOnce();
    });

    it('should clear all registrations', async () => {
      const plugin = createMockPlugin('test-plugin');
      const handler = vi.fn();

      await manager.registerPlugin(plugin);
      manager.registerCommand('test-command', handler);
      manager.on('test-event', handler);

      await manager.destroy();

      expect(manager.getAllPlugins()).toEqual([]);
      expect(manager.getPlugin('test-plugin')).toBeUndefined();
    });

    it('should handle plugins without destroy method', async () => {
      const plugin = createMockPlugin('test-plugin');
      await manager.registerPlugin(plugin);

      await expect(manager.destroy()).resolves.not.toThrow();
    });
  });

  describe('plugin lifecycle', () => {
    it('should complete full plugin lifecycle', async () => {
      const initSpy = vi.fn();
      const destroySpy = vi.fn();

      const plugin = createMockPlugin('lifecycle-test', {
        init: initSpy,
        destroy: destroySpy,
      });

      await manager.registerPlugin(plugin);
      expect(initSpy).toHaveBeenCalledOnce();

      await manager.unregisterPlugin('lifecycle-test');
      expect(destroySpy).toHaveBeenCalledOnce();
    });
  });
});
