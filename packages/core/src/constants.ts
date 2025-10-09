/**
 * Constants for Notectl Editor
 * Exported to avoid magic numbers and improve maintainability
 */

/**
 * Timeout in milliseconds to wait for editor's connectedCallback to complete
 * and render the DOM structure including plugin containers.
 *
 * This is needed when registering plugins immediately after appending the editor
 * to the DOM, as the connectedCallback runs asynchronously.
 *
 * @example
 * ```typescript
 * const editor = document.createElement('notectl-editor');
 * container.appendChild(editor);
 * await new Promise(resolve => setTimeout(resolve, EDITOR_READY_TIMEOUT));
 * await editor.registerPlugin(new ToolbarPlugin());
 * ```
 */
export const EDITOR_READY_TIMEOUT = 100; // ms

/**
 * Default timeout for screen reader announcements
 * Used to clear and reset the aria-live region
 */
export const ARIA_ANNOUNCEMENT_DELAY = 100; // ms

/**
 * Default maximum number of history entries to keep
 */
export const DEFAULT_MAX_HISTORY_DEPTH = 100;

/**
 * Default minimum height for the editor content area
 */
export const DEFAULT_MIN_HEIGHT = 200; // px

/**
 * Error codes for structured error handling
 */
export const ErrorCodes = {
  // Plugin-related errors
  PLUGIN_ALREADY_REGISTERED: 'PLUGIN_ALREADY_REGISTERED',
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
  PLUGIN_MISSING_DEPENDENCY: 'PLUGIN_MISSING_DEPENDENCY',
  PLUGIN_INVALID_CONFIG: 'PLUGIN_INVALID_CONFIG',
  PLUGIN_INIT_FAILED: 'PLUGIN_INIT_FAILED',
  PLUGIN_DESTROY_FAILED: 'PLUGIN_DESTROY_FAILED',
  PLUGIN_DEPENDENCY_CONFLICT: 'PLUGIN_DEPENDENCY_CONFLICT',

  // Editor state errors
  EDITOR_NOT_MOUNTED: 'EDITOR_NOT_MOUNTED',
  EDITOR_NOT_INITIALIZED: 'EDITOR_NOT_INITIALIZED',
  EDITOR_DESTROYED: 'EDITOR_DESTROYED',

  // Command errors
  COMMAND_NOT_FOUND: 'COMMAND_NOT_FOUND',
  COMMAND_ALREADY_REGISTERED: 'COMMAND_ALREADY_REGISTERED',
  COMMAND_EXECUTION_FAILED: 'COMMAND_EXECUTION_FAILED',
  COMMAND_INVALID_ARGS: 'COMMAND_INVALID_ARGS',

  // Content errors
  INVALID_CONTENT: 'INVALID_CONTENT',
  INVALID_DELTA: 'INVALID_DELTA',
  INVALID_DOCUMENT: 'INVALID_DOCUMENT',
  SANITIZATION_FAILED: 'SANITIZATION_FAILED',

  // Security errors
  XSS_DETECTED: 'XSS_DETECTED',
  UNSAFE_OPERATION: 'UNSAFE_OPERATION',

  // General errors
  INVALID_OPERATION: 'INVALID_OPERATION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Type for error codes
 */
export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Structured error class for Notectl
 */
export class NotectlError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'NotectlError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotectlError);
    }
  }

  /**
   * Convert to JSON-serializable format
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      }
    };
  }
}

/**
 * Validation constraints for document structure
 */
export const ValidationConstraints = {
  NO_DANGLING_REFS: 'noDanglingRefs',
  TABLE_GRID_CONSISTENT: 'tableGridConsistent',
  ALT_OR_DECORATIVE: 'altOrDecorative',
  RTL_INTEGRITY: 'rtlIntegrity',
} as const;
