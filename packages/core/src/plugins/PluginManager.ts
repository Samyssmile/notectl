/**
 * Plugin manager for registering and managing plugins
 */

import type { Plugin, PluginContext } from './Plugin.js';
import type { EditorState } from '../state/EditorState.js';
import type { Delta } from '../delta/Delta.js';
import { ErrorCodes, NotectlError } from '../constants.js';

/**
 * Plugin manager class
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private initializationOrder: string[] = [];

  constructor() {}

  /**
   * Register a plugin
   *
   * @param plugin - The plugin to register
   * @param context - Plugin context with editor APIs
   * @throws {NotectlError} If plugin validation fails or initialization errors occur
   *
   * @example
   * ```typescript
   * const toolbarPlugin = new ToolbarPlugin();
   * await pluginManager.register(toolbarPlugin, context);
   * ```
   */
  async register(plugin: Plugin, context: PluginContext): Promise<void> {
    // Validate plugin object
    if (!plugin) {
      throw new NotectlError(
        ErrorCodes.PLUGIN_INVALID_CONFIG,
        'Cannot register null or undefined plugin'
      );
    }

    if (!plugin.id || typeof plugin.id !== 'string') {
      throw new NotectlError(
        ErrorCodes.PLUGIN_INVALID_CONFIG,
        'Plugin must have a valid string "id" property',
        { plugin }
      );
    }

    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new NotectlError(
        ErrorCodes.PLUGIN_INVALID_CONFIG,
        `Plugin "${plugin.id}" must have a valid string "name" property`,
        { pluginId: plugin.id }
      );
    }

    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new NotectlError(
        ErrorCodes.PLUGIN_INVALID_CONFIG,
        `Plugin "${plugin.id}" must have a valid string "version" property`,
        { pluginId: plugin.id, pluginName: plugin.name }
      );
    }

    if (typeof plugin.init !== 'function') {
      throw new NotectlError(
        ErrorCodes.PLUGIN_INVALID_CONFIG,
        `Plugin "${plugin.id}" must have an "init" method`,
        { pluginId: plugin.id, pluginName: plugin.name }
      );
    }

    // Check if already registered
    if (this.plugins.has(plugin.id)) {
      const existing = this.plugins.get(plugin.id)!;
      throw new NotectlError(
        ErrorCodes.PLUGIN_ALREADY_REGISTERED,
        `Plugin "${plugin.id}" is already registered (version: ${existing.version})`,
        { pluginId: plugin.id, existingVersion: existing.version, newVersion: plugin.version }
      );
    }

    // Check dependencies
    if (plugin.dependencies && plugin.dependencies.length > 0) {
      const missingDeps: string[] = [];

      for (const depId of plugin.dependencies) {
        if (!this.plugins.has(depId)) {
          missingDeps.push(depId);
        }
      }

      if (missingDeps.length > 0) {
        throw new NotectlError(
          ErrorCodes.PLUGIN_MISSING_DEPENDENCY,
          `Plugin "${plugin.id}" (${plugin.name}) cannot be registered because the following dependencies are missing: ${missingDeps.join(', ')}. Please register these plugins first.`,
          {
            pluginId: plugin.id,
            pluginName: plugin.name,
            missingDependencies: missingDeps,
            registeredPlugins: Array.from(this.plugins.keys())
          }
        );
      }
    }

    // Initialize plugin
    try {
      await plugin.init(context);
    } catch (error) {
      throw new NotectlError(
        ErrorCodes.PLUGIN_INIT_FAILED,
        `Failed to initialize plugin "${plugin.id}" (${plugin.name}): ${error instanceof Error ? error.message : String(error)}`,
        {
          pluginId: plugin.id,
          pluginName: plugin.name,
          originalError: error
        }
      );
    }

    // Store plugin
    this.plugins.set(plugin.id, plugin);
    this.initializationOrder.push(plugin.id);

    // Emit event
    context.emit('plugin-registered', { pluginId: plugin.id, plugin });
  }

  /**
   * Unregister a plugin
   *
   * @param pluginId - ID of the plugin to unregister
   * @param context - Plugin context for event emission
   * @throws {NotectlError} If plugin is not found or has dependents
   *
   * @example
   * ```typescript
   * await pluginManager.unregister('toolbar-plugin', context);
   * ```
   */
  async unregister(pluginId: string, context: PluginContext): Promise<void> {
    // Validate plugin ID
    if (!pluginId || typeof pluginId !== 'string') {
      throw new NotectlError(
        ErrorCodes.PLUGIN_NOT_FOUND,
        'Plugin ID must be a non-empty string',
        { pluginId }
      );
    }

    // Check if plugin exists
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new NotectlError(
        ErrorCodes.PLUGIN_NOT_FOUND,
        `Plugin "${pluginId}" is not registered and cannot be unregistered`,
        {
          pluginId,
          registeredPlugins: Array.from(this.plugins.keys())
        }
      );
    }

    // Check if other plugins depend on this one
    const dependentPlugins: string[] = [];
    for (const [id, p] of this.plugins.entries()) {
      if (p.dependencies?.includes(pluginId)) {
        dependentPlugins.push(`${id} (${p.name})`);
      }
    }

    if (dependentPlugins.length > 0) {
      throw new NotectlError(
        ErrorCodes.PLUGIN_DEPENDENCY_CONFLICT,
        `Cannot unregister plugin "${pluginId}" (${plugin.name}) because the following plugins depend on it: ${dependentPlugins.join(', ')}. Please unregister dependent plugins first.`,
        {
          pluginId,
          pluginName: plugin.name,
          dependentPlugins: dependentPlugins
        }
      );
    }

    // Destroy plugin
    if (plugin.destroy) {
      try {
        await plugin.destroy();
      } catch (error) {
        throw new NotectlError(
          ErrorCodes.PLUGIN_DESTROY_FAILED,
          `Failed to destroy plugin "${pluginId}" (${plugin.name}): ${error instanceof Error ? error.message : String(error)}`,
          {
            pluginId,
            pluginName: plugin.name,
            originalError: error
          }
        );
      }
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
