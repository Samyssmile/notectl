/**
 * Accessibility utilities tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  announceToScreenReader,
  getFocusableElements,
  trapFocus,
  getAriaLabel,
  getShortcutDescription,
  setAriaAttributes,
  createVisuallyHidden,
  updateAriaLive,
  prefersReducedMotion,
  prefersHighContrast,
  getContrastRatio,
  registerKeyboardShortcuts,
  type KeyboardShortcut
} from '../../src/utils/accessibility';

describe('Accessibility Utilities', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('announceToScreenReader', () => {
    it('should create a live region', () => {
      announceToScreenReader('Test message');

      const liveRegion = document.getElementById('notectl-sr-live');
      expect(liveRegion).toBeTruthy();
      expect(liveRegion?.getAttribute('role')).toBe('status');
      expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    });

    it('should set message content', (done) => {
      announceToScreenReader('Test message');

      setTimeout(() => {
        const liveRegion = document.getElementById('notectl-sr-live');
        expect(liveRegion?.textContent).toBe('Test message');
        done();
      }, 150);
    });

    it('should support different politeness levels', () => {
      announceToScreenReader('Urgent', 'assertive');

      const liveRegion = document.getElementById('notectl-sr-live');
      expect(liveRegion?.getAttribute('aria-live')).toBe('assertive');
    });
  });

  describe('getFocusableElements', () => {
    it('should find focusable elements', () => {
      container.innerHTML = `
        <button>Button</button>
        <a href="#">Link</a>
        <input type="text" />
        <div contenteditable="true">Editable</div>
      `;

      const focusable = getFocusableElements(container);
      expect(focusable.length).toBe(4);
    });

    it('should exclude disabled elements', () => {
      container.innerHTML = `
        <button>Enabled</button>
        <button disabled>Disabled</button>
      `;

      const focusable = getFocusableElements(container);
      expect(focusable.length).toBe(1);
      expect(focusable[0].textContent).toBe('Enabled');
    });

    it('should exclude hidden elements', () => {
      container.innerHTML = `
        <button>Visible</button>
        <button hidden>Hidden</button>
      `;

      const focusable = getFocusableElements(container);
      expect(focusable.length).toBe(1);
    });

    it('should include elements with tabindex', () => {
      container.innerHTML = `
        <div tabindex="0">Focusable div</div>
        <div tabindex="-1">Not focusable div</div>
      `;

      const focusable = getFocusableElements(container);
      expect(focusable.length).toBe(1);
    });
  });

  describe('trapFocus', () => {
    it('should focus initial element', () => {
      container.innerHTML = `
        <button id="first">First</button>
        <button id="second">Second</button>
      `;

      const firstButton = container.querySelector('#first') as HTMLElement;
      trapFocus({ container });

      expect(document.activeElement).toBe(firstButton);
    });

    it('should return cleanup function', () => {
      container.innerHTML = '<button>Button</button>';

      const cleanup = trapFocus({ container });
      expect(typeof cleanup).toBe('function');

      cleanup();
    });

    it('should handle escape key when enabled', () => {
      container.innerHTML = '<button>Button</button>';

      const returnFocus = document.createElement('button');
      document.body.appendChild(returnFocus);

      const cleanup = trapFocus({
        container,
        returnFocus,
        escapeDeactivates: true
      });

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      cleanup();
    });
  });

  describe('getAriaLabel', () => {
    it('should return label for known actions', () => {
      expect(getAriaLabel('bold')).toBe('Toggle bold formatting');
      expect(getAriaLabel('italic')).toBe('Toggle italic formatting');
      expect(getAriaLabel('undo')).toBe('Undo last action');
    });

    it('should include state when provided', () => {
      expect(getAriaLabel('bold', 'active')).toBe('Toggle bold formatting (active)');
    });

    it('should return action name for unknown actions', () => {
      expect(getAriaLabel('custom-action')).toBe('custom-action');
    });
  });

  describe('getShortcutDescription', () => {
    it('should format keyboard shortcuts', () => {
      const shortcut: KeyboardShortcut = {
        key: 'b',
        ctrlKey: true,
        description: 'Bold',
        action: () => {}
      };

      const result = getShortcutDescription(shortcut);
      expect(result).toMatch(/Ctrl\+B - Bold/);
    });

    it('should handle shift modifier', () => {
      const shortcut: KeyboardShortcut = {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        description: 'Redo',
        action: () => {}
      };

      const result = getShortcutDescription(shortcut);
      expect(result).toMatch(/Shift/);
      expect(result).toMatch(/Z/);
    });
  });

  describe('registerKeyboardShortcuts', () => {
    it('should register and execute shortcuts', () => {
      const mockAction = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        {
          key: 'b',
          ctrlKey: true,
          description: 'Bold',
          action: mockAction
        }
      ];

      const cleanup = registerKeyboardShortcuts(shortcuts, container);

      const event = new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true
      });
      container.dispatchEvent(event);

      expect(mockAction).toHaveBeenCalled();
      cleanup();
    });

    it('should return cleanup function', () => {
      const shortcuts: KeyboardShortcut[] = [
        {
          key: 'b',
          ctrlKey: true,
          description: 'Bold',
          action: () => {}
        }
      ];

      const cleanup = registerKeyboardShortcuts(shortcuts, container);
      expect(typeof cleanup).toBe('function');

      cleanup();
    });
  });

  describe('setAriaAttributes', () => {
    it('should set ARIA attributes', () => {
      const element = document.createElement('div');
      setAriaAttributes(element, {
        label: 'Test label',
        hidden: false,
        live: 'polite'
      });

      expect(element.getAttribute('aria-label')).toBe('Test label');
      expect(element.getAttribute('aria-hidden')).toBe('false');
      expect(element.getAttribute('aria-live')).toBe('polite');
    });

    it('should handle aria- prefixed attributes', () => {
      const element = document.createElement('div');
      setAriaAttributes(element, {
        'aria-label': 'Test'
      });

      expect(element.getAttribute('aria-label')).toBe('Test');
    });
  });

  describe('createVisuallyHidden', () => {
    it('should create visually hidden element', () => {
      const element = createVisuallyHidden('Hidden text');

      expect(element.textContent).toBe('Hidden text');
      expect(element.style.position).toBe('absolute');
      expect(element.style.left).toBe('-10000px');
      expect(element.getAttribute('aria-hidden')).toBe('false');
    });
  });

  describe('updateAriaLive', () => {
    it('should create and update live region', () => {
      updateAriaLive('test-live', 'Test message', 'polite');

      const liveRegion = document.getElementById('test-live');
      expect(liveRegion).toBeTruthy();
      expect(liveRegion?.textContent).toBe('Test message');
      expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    });

    it('should update existing live region', () => {
      updateAriaLive('test-live', 'First message');
      updateAriaLive('test-live', 'Second message');

      const liveRegion = document.getElementById('test-live');
      expect(liveRegion?.textContent).toBe('Second message');
    });
  });

  describe('prefersReducedMotion', () => {
    it('should check reduced motion preference', () => {
      const result = prefersReducedMotion();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('prefersHighContrast', () => {
    it('should check high contrast preference', () => {
      const result = prefersHighContrast();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate contrast ratio for black on white', () => {
      const ratio = getContrastRatio('#000000', '#FFFFFF');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('should calculate contrast ratio for white on black', () => {
      const ratio = getContrastRatio('#FFFFFF', '#000000');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('should calculate contrast ratio for similar colors', () => {
      const ratio = getContrastRatio('#FFFFFF', '#FEFEFE');
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(2);
    });

    it('should meet WCAG AA for body text', () => {
      // Dark gray on white should have ratio > 4.5
      const ratio = getContrastRatio('#595959', '#FFFFFF');
      expect(ratio).toBeGreaterThan(4.5);
    });

    it('should meet WCAG AAA for body text', () => {
      // Black on white should have ratio > 7
      const ratio = getContrastRatio('#000000', '#FFFFFF');
      expect(ratio).toBeGreaterThan(7);
    });
  });
});
