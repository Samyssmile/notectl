/**
 * Plugin manager for registering and managing plugins
 */

import type { Plugin, PluginContext } from './Plugin.js';
import type { EditorState } from '../state/EditorState.js';
import type { Delta } from '../delta/Delta.js';

/**
 * Plugin manager class
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private initializationOrder: string[] = [];

  constructor() {}

  /**
   * Register a plugin
   */
  async register(plugin: Plugin, context: PluginContext): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} is already registered`);
    }

    // Check dependencies
    if (plugin.dependencies) {
      for (const depId of plugin.dependencies) {
        if (!this.plugins.has(depId)) {
          throw new Error(`Plugin ${plugin.id} depends on ${depId} which is not registered`);
        }
      }
    }

    // Initialize plugin
    await plugin.init(context);

    // Store plugin
    this.plugins.set(plugin.id, plugin);
    this.initializationOrder.push(plugin.id);

    // Emit event
    context.emit('plugin-registered', { pluginId: plugin.id, plugin });
  }

  /**
   * Unregister a plugin
   */
  async unregister(pluginId: string, context: PluginContext): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }

    // Check if other plugins depend on this one
    for (const [id, p] of this.plugins.entries()) {
      if (p.dependencies?.includes(pluginId)) {
        throw new Error(`Cannot unregister ${pluginId}: plugin ${id} depends on it`);
      }
    }

    // Destroy plugin
    if (plugin.destroy) {
      await plugin.destroy();
    }

    // Remove plugin
    this.plugins.delete(pluginId);
    this.initializationOrder = this.initializationOrder.filter((id) => id !== pluginId);

    // Emit event
    context.emit('plugin-unregistered', { pluginId });
  }

  /**
   * Get a plugin by ID
   */
  get(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if a plugin is registered
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get all registered plugins
   */
  getAll(): Plugin[] {
    return this.initializationOrder.map((id) => this.plugins.get(id)!);
  }

  /**
   * Notify plugins of state update
   */
  notifyStateUpdate(oldState: EditorState, newState: EditorState): void {
    for (const pluginId of this.initializationOrder) {
      const plugin = this.plugins.get(pluginId);
      if (plugin?.onStateUpdate) {
        try {
          plugin.onStateUpdate(oldState, newState);
        } catch (error) {
          console.error(`Error in plugin ${pluginId} onStateUpdate:`, error);
        }
      }
    }
  }

  /**
   * Notify plugins of delta application
   */
  notifyDeltaApplied(delta: Delta): void {
    for (const pluginId of this.initializationOrder) {
      const plugin = this.plugins.get(pluginId);
      if (plugin?.onDeltaApplied) {
        try {
          plugin.onDeltaApplied(delta);
        } catch (error) {
          console.error(`Error in plugin ${pluginId} onDeltaApplied:`, error);
        }
      }
    }
  }

  /**
   * Destroy all plugins
   */
  async destroyAll(): Promise<void> {
    // Destroy in reverse order
    const pluginIds = [...this.initializationOrder].reverse();
    
    for (const pluginId of pluginIds) {
      const plugin = this.plugins.get(pluginId);
      if (plugin?.destroy) {
        try {
          await plugin.destroy();
        } catch (error) {
          console.error(`Error destroying plugin ${pluginId}:`, error);
        }
      }
    }

    this.plugins.clear();
    this.initializationOrder = [];
  }
}
