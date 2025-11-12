/**
 * Type-safe EventEmitter utility
 * Generic event emitter with type-safe event names and payloads
 *
 * @example
 * ```typescript
 * interface MyEvents {
 *   'data': { value: number };
 *   'error': { message: string };
 * }
 *
 * const emitter = new EventEmitter<MyEvents>();
 * emitter.on('data', (payload) => {
 *   // payload is typed as { value: number }
 *   console.log(payload.value);
 * });
 * ```
 */
export class EventEmitter<TEventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof TEventMap | string, Set<(data: unknown) => void>>();

  /**
   * Register an event listener
   * @param event - Event name
   * @param callback - Callback function
   */
  on<K extends keyof TEventMap | (string & {})>(
    event: K,
    callback: K extends keyof TEventMap
      ? (data: TEventMap[K]) => void
      : (data: unknown) => void
  ): void {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, new Set());
    }
    this.listeners.get(event as string)!.add(callback as (data: unknown) => void);
  }

  /**
   * Unregister an event listener
   * @param event - Event name
   * @param callback - Callback function to remove
   */
  off<K extends keyof TEventMap | (string & {})>(
    event: K,
    callback: K extends keyof TEventMap
      ? (data: TEventMap[K]) => void
      : (data: unknown) => void
  ): void {
    this.listeners.get(event as string)?.delete(callback as (data: unknown) => void);
  }

  /**
   * Emit an event to all registered listeners
   * @param event - Event name
   * @param data - Event payload
   */
  emit<K extends keyof TEventMap | (string & {})>(
    event: K,
    data: K extends keyof TEventMap ? TEventMap[K] : unknown
  ): void {
    const callbacks = this.listeners.get(event as string);
    if (!callbacks) return;

    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for "${String(event)}":`, error);
      }
    });
  }

  /**
   * Register a one-time event listener
   * Automatically removes itself after first invocation
   * @param event - Event name
   * @param callback - Callback function
   */
  once<K extends keyof TEventMap | (string & {})>(
    event: K,
    callback: K extends keyof TEventMap
      ? (data: TEventMap[K]) => void
      : (data: unknown) => void
  ): void {
    const wrappedCallback = (data: unknown) => {
      this.off(event, wrappedCallback as never);
      (callback as (data: unknown) => void)(data);
    };
    this.on(event, wrappedCallback as never);
  }

  /**
   * Remove all listeners for a specific event
   * If no event is specified, removes all listeners
   * @param event - Optional event name
   */
  removeAllListeners(event?: keyof TEventMap | string): void {
    if (event !== undefined) {
      this.listeners.delete(event as string);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for a specific event
   * @param event - Event name
   * @returns Number of registered listeners
   */
  listenerCount(event: keyof TEventMap | string): number {
    return this.listeners.get(event as string)?.size ?? 0;
  }

  /**
   * Get all registered event names
   * @returns Array of event names
   */
  eventNames(): Array<keyof TEventMap | string> {
    return Array.from(this.listeners.keys());
  }
}
