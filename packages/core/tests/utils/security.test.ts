/**
 * Security utilities tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sanitizeHTML,
  sanitizeContent,
  escapeHTML,
  unescapeHTML,
  validateDelta,
  sanitizeURL,
  containsXSS,
  removeDangerousAttributes,
  sanitizeElement
} from '../../src/utils/security';

describe('Security Utilities', () => {
  describe('sanitizeHTML', () => {
    it('should allow safe HTML tags', () => {
      const html = '<p><strong>Bold</strong> and <em>italic</em></p>';
      const result = sanitizeHTML(html);
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
    });

    it('should remove script tags', () => {
      const html = '<p>Hello</p><script>alert("XSS")</script>';
      const result = sanitizeHTML(html);
      expect(result).not.toContain('<script');
      expect(result).toContain('Hello');
    });

    it('should remove onclick handlers', () => {
      const html = '<button onclick="alert(\'XSS\')">Click</button>';
      const result = sanitizeHTML(html);
      expect(result).not.toContain('onclick');
    });

    it('should allow data attributes', () => {
      const html = '<div data-id="123">Content</div>';
      const result = sanitizeHTML(html);
      expect(result).toContain('data-id');
    });

    it('should use strict mode when requested', () => {
      const html = '<p><strong>Bold</strong><a href="#">Link</a></p>';
      const result = sanitizeHTML(html, true);
      expect(result).toContain('<strong>');
      expect(result).not.toContain('<a');
    });

    it('should sanitize javascript: URLs', () => {
      const html = '<a href="javascript:alert(\'XSS\')">Link</a>';
      const result = sanitizeHTML(html);
      expect(result).not.toContain('javascript:');
    });

    it('should preserve ARIA attributes', () => {
      const html = '<div role="button" aria-label="Click me">Button</div>';
      const result = sanitizeHTML(html);
      expect(result).toContain('role="button"');
      expect(result).toContain('aria-label');
    });
  });

  describe('sanitizeContent', () => {
    it('should sanitize HTML when allowed', () => {
      const content = '<p>Safe</p><script>alert("XSS")</script>';
      const result = sanitizeContent(content, true);
      expect(result).toContain('Safe');
      expect(result).not.toContain('<script');
    });

    it('should escape all HTML when not allowed', () => {
      const content = '<p>Text</p>';
      const result = sanitizeContent(content, false);
      expect(result).toContain('&lt;p&gt;');
      expect(result).not.toContain('<p>');
    });
  });

  describe('escapeHTML', () => {
    it('should escape HTML entities', () => {
      const text = '<div>Test & "quotes"</div>';
      const result = escapeHTML(text);
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&amp;');
    });

    it('should handle special characters', () => {
      const text = '<script>alert("XSS")</script>';
      const result = escapeHTML(text);
      expect(result).not.toContain('<script>');
    });
  });

  describe('unescapeHTML', () => {
    it('should unescape HTML entities', () => {
      const html = '&lt;div&gt;Test&lt;/div&gt;';
      const result = unescapeHTML(html);
      expect(result).toBe('<div>Test</div>');
    });
  });

  describe('validateDelta', () => {
    it('should validate safe delta operations', () => {
      const delta = {
        ops: [
          { insert: 'Hello world' },
          { insert: '\n', attributes: { header: 1 } }
        ]
      };
      expect(validateDelta(delta)).toBe(true);
    });

    it('should reject deltas with script tags', () => {
      const delta = {
        ops: [
          { insert: '<script>alert("XSS")</script>' }
        ]
      };
      expect(validateDelta(delta)).toBe(false);
    });

    it('should reject deltas with event handlers', () => {
      const delta = {
        ops: [
          { insert: 'text', attributes: { onclick: 'alert("XSS")' } }
        ]
      };
      expect(validateDelta(delta)).toBe(false);
    });

    it('should reject deltas with dangerous object properties', () => {
      const delta = {
        ops: [
          { insert: { script: 'alert("XSS")' } }
        ]
      };
      expect(validateDelta(delta)).toBe(false);
    });

    it('should reject invalid delta structure', () => {
      const delta = { invalid: true };
      expect(validateDelta(delta as any)).toBe(false);
    });

    it('should handle null/undefined deltas', () => {
      expect(validateDelta(null as any)).toBe(false);
      expect(validateDelta(undefined as any)).toBe(false);
    });
  });

  describe('sanitizeURL', () => {
    it('should allow safe http URLs', () => {
      const url = 'http://example.com';
      const result = sanitizeURL(url);
      expect(result).toBe('http://example.com/');
    });

    it('should allow safe https URLs', () => {
      const url = 'https://example.com/path';
      const result = sanitizeURL(url);
      expect(result).toBe('https://example.com/path');
    });

    it('should allow mailto URLs', () => {
      const url = 'mailto:test@example.com';
      const result = sanitizeURL(url);
      expect(result).toBe('mailto:test@example.com');
    });

    it('should block javascript: URLs', () => {
      const url = 'javascript:alert("XSS")';
      const result = sanitizeURL(url);
      expect(result).toBe('');
    });

    it('should block data: URLs', () => {
      const url = 'data:text/html,<script>alert("XSS")</script>';
      const result = sanitizeURL(url);
      expect(result).toBe('');
    });

    it('should block vbscript: URLs', () => {
      const url = 'vbscript:msgbox("XSS")';
      const result = sanitizeURL(url);
      expect(result).toBe('');
    });

    it('should handle invalid URLs', () => {
      const url = 'not a valid url';
      const result = sanitizeURL(url);
      expect(result).toBe('');
    });
  });

  describe('containsXSS', () => {
    it('should detect script tags', () => {
      expect(containsXSS('<script>alert("XSS")</script>')).toBe(true);
      expect(containsXSS('<SCRIPT>alert("XSS")</SCRIPT>')).toBe(true);
    });

    it('should detect javascript: URLs', () => {
      expect(containsXSS('javascript:alert("XSS")')).toBe(true);
      expect(containsXSS('JAVASCRIPT:alert("XSS")')).toBe(true);
    });

    it('should detect event handlers', () => {
      expect(containsXSS('<img onerror="alert(\'XSS\')">')).toBe(true);
      expect(containsXSS('<div onclick="malicious()">')).toBe(true);
    });

    it('should detect iframe tags', () => {
      expect(containsXSS('<iframe src="evil.com"></iframe>')).toBe(true);
    });

    it('should not flag safe content', () => {
      expect(containsXSS('<p>Safe content</p>')).toBe(false);
      expect(containsXSS('Just plain text')).toBe(false);
    });
  });

  describe('removeDangerousAttributes', () => {
    it('should remove event handler attributes', () => {
      const div = document.createElement('div');
      div.setAttribute('onclick', 'alert("XSS")');
      div.setAttribute('onerror', 'alert("XSS")');

      removeDangerousAttributes(div);

      expect(div.hasAttribute('onclick')).toBe(false);
      expect(div.hasAttribute('onerror')).toBe(false);
    });

    it('should remove javascript: from attributes', () => {
      const a = document.createElement('a');
      a.setAttribute('href', 'javascript:alert("XSS")');

      removeDangerousAttributes(a);

      expect(a.hasAttribute('href')).toBe(false);
    });

    it('should preserve safe attributes', () => {
      const div = document.createElement('div');
      div.setAttribute('id', 'test');
      div.setAttribute('class', 'safe');

      removeDangerousAttributes(div);

      expect(div.getAttribute('id')).toBe('test');
      expect(div.getAttribute('class')).toBe('safe');
    });
  });

  describe('sanitizeElement', () => {
    it('should sanitize element and children recursively', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      child.setAttribute('onclick', 'alert("XSS")');
      parent.appendChild(child);

      sanitizeElement(parent);

      expect(child.hasAttribute('onclick')).toBe(false);
    });

    it('should handle nested elements', () => {
      const root = document.createElement('div');
      const level1 = document.createElement('div');
      const level2 = document.createElement('div');

      level2.setAttribute('onerror', 'alert("XSS")');
      level1.appendChild(level2);
      root.appendChild(level1);

      sanitizeElement(root);

      expect(level2.hasAttribute('onerror')).toBe(false);
    });
  });
});
