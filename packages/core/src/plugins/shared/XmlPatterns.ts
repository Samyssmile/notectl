/**
 * Shared XML regex pattern fragments used by XmlDetector and XML language definition.
 *
 * Based on XML 1.0 spec Name production (simplified to ASCII + common extensions).
 */

/** XML tag name pattern (string fragment for RegExp construction). */
export const XML_TAG_NAME = '[a-zA-Z_][\\w:.-]*';

/** Optional attributes pattern (string fragment for RegExp construction). */
export const XML_ATTRS = '(?:\\s(?:[^>"\']|"[^"]*"|\'[^\']*\')*)?';
