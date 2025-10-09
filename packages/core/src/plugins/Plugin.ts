/**
 * Plugin interface and types for Notectl
 */

import type { EditorState } from '../state/EditorState.js';
import type { Delta } from '../delta/Delta.js';

/**
 * Plugin context provided to plugins
 */
export interface PluginContext {
  /**
   * Get current editor state
   */
  getState(): EditorState;

  /**
   * Apply a delta to the editor
   */
  applyDelta(delta: Delta): void;

  /**
   * Register event listener
   */
  on(event: string, callback: (data: unknown) => void): void;

  /**
   * Unregister event listener
   */
  off(event: string, callback: (data: unknown) => void): void;

  /**
   * Emit an event
   */
  emit(event: string, data?: unknown): void;

  /**
   * Register a command
   */
  registerCommand(name: string, handler: CommandHandler): void;

  /**
   * Execute a command
   */
  executeCommand(name: string, ...args: unknown[]): unknown;

  /**
   * Access DOM container (editable area)
   */
  getContainer(): HTMLElement;

  /**
   * Access plugin container for UI elements (toolbar, etc.)
   * @param position - 'top' or 'bottom'
   */
  getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
}

/**
 * Command handler function
 */
export type CommandHandler = (...args: unknown[]) => unknown;

/**
 * Plugin interface
 */
export interface Plugin {
  /**
   * Unique plugin identifier
   */
  id: string;

  /**
   * Plugin name
   */
  name: string;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Plugin dependencies (optional)
   */
  dependencies?: string[];

  /**
   * Initialize the plugin
   */
  init(context: PluginContext): Promise<void> | void;

  /**
   * Cleanup the plugin
   */
  destroy?(): Promise<void> | void;

  /**
   * Handle state updates (optional)
   */
  onStateUpdate?(oldState: EditorState, newState: EditorState): void;

  /**
   * Handle delta application (optional)
   */
  onDeltaApplied?(delta: Delta): void;
}

/**
 * Plugin factory function type
 */
export type PluginFactory<TConfig = unknown> = (config?: TConfig) => Plugin;

/**
 * Base plugin class for convenience
 */
export abstract class BasePlugin implements Plugin {
  abstract id: string;
  abstract name: string;
  abstract version: string;
  dependencies?: string[];

  protected context?: PluginContext;

  async init(context: PluginContext): Promise<void> {
    this.context = context;
  }

  async destroy(): Promise<void> {
    this.context = undefined;
  }

  protected getContext(): PluginContext {
    if (!this.context) {
      throw new Error('Plugin not initialized');
    }
    return this.context;
  }
}
