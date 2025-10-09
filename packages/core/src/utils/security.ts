/**
 * Security utilities for XSS prevention and content sanitization
 */

import DOMPurify from 'dompurify';
import type { Delta } from '../delta/Delta.js';
import type { Config } from 'dompurify';

/**
 * DOMPurify configuration for editor content
 */
const EDITOR_SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span'
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id',
    'style', 'data-*',
    'role', 'aria-*'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  KEEP_CONTENT: true,
  SANITIZE_DOM: true,
  SAFE_FOR_TEMPLATES: true,
};

/**
 * Strict DOMPurify configuration for untrusted content
 */
const STRICT_SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'code'],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
  SANITIZE_DOM: true,
  SAFE_FOR_TEMPLATES: true,
};

/**
 * Sanitize HTML content using DOMPurify
 * @param html - HTML content to sanitize
 * @param strict - Use strict configuration (default: false)
 * @returns Sanitized HTML
 */
export function sanitizeHTML(html: string, strict: boolean = false): string {
  const config = strict ? STRICT_SANITIZE_CONFIG : EDITOR_SANITIZE_CONFIG;
  return DOMPurify.sanitize(html, config) as string;
}

/**
 * Sanitize user content (text and HTML)
 * @param content - Content to sanitize
 * @param allowHTML - Allow HTML tags (default: true)
 * @returns Sanitized content
 */
export function sanitizeContent(content: string, allowHTML: boolean = true): string {
  if (!allowHTML) {
    // Escape all HTML
    return escapeHTML(content);
  }

  // Sanitize HTML while preserving allowed tags
  return sanitizeHTML(content);
}

/**
 * Escape HTML entities
 * @param text - Text to escape
 * @returns Escaped text
 */
export function escapeHTML(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Unescape HTML entities
 * @param html - HTML to unescape
 * @returns Unescaped text
 */
export function unescapeHTML(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/**
 * Validate delta operations for potential XSS
 * @param delta - Delta to validate
 * @returns True if delta is safe
 */
export function validateDelta(delta: Delta): boolean {
  try {
    // Check if delta has required structure
    if (!delta || typeof delta !== 'object') {
      return false;
    }

    // Validate operations array
    if (!Array.isArray(delta.ops)) {
      return false;
    }

    // Check each operation
    for (const op of delta.ops) {
      // Validate insert operations
      if ('insert' in op) {
        const insert = op.insert;

        // Check for script injection in strings
        if (typeof insert === 'string') {
          const sanitized = sanitizeHTML(insert);
          if (sanitized !== insert && insert.includes('<script')) {
            return false;
          }
        }

        // Check for dangerous attributes
        if (typeof insert === 'object' && insert !== null) {
          const insertObj = insert as Record<string, unknown>;
          if ('script' in insertObj || 'onerror' in insertObj || 'onclick' in insertObj) {
            return false;
          }
        }
      }

      // Validate attributes
      if ('attributes' in op && op.attributes) {
        const attrs = op.attributes as Record<string, unknown>;

        // Check for event handlers
        for (const key in attrs) {
          if (key.startsWith('on') || key.toLowerCase().includes('script')) {
            return false;
          }
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error validating delta:', error);
    return false;
  }
}

/**
 * Prevent XSS in URLs
 * @param url - URL to validate
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeURL(url: string): string {
  try {
    const trimmed = url.trim();

    // Block javascript: and data: URLs
    if (
      trimmed.toLowerCase().startsWith('javascript:') ||
      trimmed.toLowerCase().startsWith('data:') ||
      trimmed.toLowerCase().startsWith('vbscript:')
    ) {
      return '';
    }

    // Validate URL format
    const urlObj = new URL(trimmed, window.location.origin);

    // Only allow http, https, mailto, tel protocols
    const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
    if (!allowedProtocols.includes(urlObj.protocol)) {
      return '';
    }

    return urlObj.href;
  } catch {
    // Invalid URL
    return '';
  }
}

/**
 * Create a safe HTML string with sanitization
 * @param strings - Template strings
 * @param values - Template values
 * @returns Sanitized HTML
 */
export function safeHTML(strings: TemplateStringsArray, ...values: unknown[]): string {
  let html = strings[0];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const escaped = typeof value === 'string' ? escapeHTML(value) : String(value);
    html += escaped + strings[i + 1];
  }

  return sanitizeHTML(html);
}

/**
 * Remove dangerous attributes from an element
 * @param element - Element to clean
 */
export function removeDangerousAttributes(element: Element): void {
  const dangerousAttrs = [
    'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
    'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress'
  ];

  dangerousAttrs.forEach(attr => {
    if (element.hasAttribute(attr)) {
      element.removeAttribute(attr);
    }
  });

  // Check all attributes for javascript:
  Array.from(element.attributes).forEach(attr => {
    if (attr.value.toLowerCase().includes('javascript:')) {
      element.removeAttribute(attr.name);
    }
  });
}

/**
 * Sanitize DOM element and its children
 * @param element - Element to sanitize
 */
export function sanitizeElement(element: Element): void {
  // Remove dangerous attributes from current element
  removeDangerousAttributes(element);

  // Recursively sanitize children
  Array.from(element.children).forEach(child => {
    sanitizeElement(child);
  });
}

/**
 * Check if content contains potential XSS
 * @param content - Content to check
 * @returns True if potentially dangerous
 */
export function containsXSS(content: string): boolean {
  const dangerous = [
    '<script',
    'javascript:',
    'onerror=',
    'onclick=',
    'onload=',
    '<iframe',
    '<object',
    '<embed',
    'data:text/html'
  ];

  const lower = content.toLowerCase();
  return dangerous.some(pattern => lower.includes(pattern));
}
