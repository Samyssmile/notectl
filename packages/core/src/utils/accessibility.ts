/**
 * Accessibility utilities for ARIA attributes and screen reader support
 */

/**
 * ARIA live region politeness levels
 */
export type AriaLive = 'off' | 'polite' | 'assertive';

/**
 * Keyboard shortcut configuration
 */
export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  action: () => void;
}

/**
 * Focus trap configuration
 */
export interface FocusTrapConfig {
  container: HTMLElement;
  initialFocus?: HTMLElement;
  returnFocus?: HTMLElement;
  escapeDeactivates?: boolean;
}

/**
 * Announce message to screen readers
 * @param message - Message to announce
 * @param politeness - ARIA live politeness level
 */
export function announceToScreenReader(
  message: string,
  politeness: AriaLive = 'polite'
): void {
  // Create or get existing live region
  let liveRegion = document.getElementById('notectl-sr-live');

  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'notectl-sr-live';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', politeness);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  } else {
    liveRegion.setAttribute('aria-live', politeness);
  }

  // Clear and set message (ensures announcement)
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion!.textContent = message;
  }, 100);
}

/**
 * Get all focusable elements within a container
 * @param container - Container element
 * @returns Array of focusable elements
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    el => {
      // Check if element is visible
      return el.offsetParent !== null &&
             getComputedStyle(el).visibility !== 'hidden' &&
             !el.hasAttribute('hidden');
    }
  );
}

/**
 * Trap focus within a container
 * @param config - Focus trap configuration
 * @returns Cleanup function
 */
export function trapFocus(config: FocusTrapConfig): () => void {
  const { container, initialFocus, returnFocus, escapeDeactivates = true } = config;

  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) {
    console.warn('No focusable elements found in container');
    return () => {};
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  // Focus initial element
  if (initialFocus && focusableElements.includes(initialFocus)) {
    initialFocus.focus();
  } else {
    firstElement.focus();
  }

  // Handle keyboard events
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        // Shift+Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    } else if (escapeDeactivates && event.key === 'Escape') {
      event.preventDefault();
      deactivate();
    }
  };

  // Deactivate focus trap
  const deactivate = (): void => {
    document.removeEventListener('keydown', handleKeyDown);
    if (returnFocus) {
      returnFocus.focus();
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  return deactivate;
}

/**
 * Generate ARIA label for editor actions
 * @param action - Action name
 * @param state - Current state description
 * @returns ARIA label
 */
export function getAriaLabel(action: string, state?: string): string {
  const labels: Record<string, string> = {
    bold: 'Toggle bold formatting',
    italic: 'Toggle italic formatting',
    underline: 'Toggle underline formatting',
    strikethrough: 'Toggle strikethrough formatting',
    code: 'Toggle code formatting',
    heading1: 'Format as heading level 1',
    heading2: 'Format as heading level 2',
    heading3: 'Format as heading level 3',
    bulletList: 'Create bullet list',
    orderedList: 'Create numbered list',
    blockquote: 'Create blockquote',
    codeBlock: 'Create code block',
    link: 'Insert link',
    image: 'Insert image',
    undo: 'Undo last action',
    redo: 'Redo last action',
    clear: 'Clear formatting'
  };

  const baseLabel = labels[action] || action;
  return state ? `${baseLabel} (${state})` : baseLabel;
}

/**
 * Get keyboard shortcut description
 * @param shortcut - Keyboard shortcut
 * @returns Human-readable description
 */
export function getShortcutDescription(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (shortcut.ctrlKey || shortcut.metaKey) {
    parts.push(isMac ? 'Cmd' : 'Ctrl');
  }
  if (shortcut.shiftKey) {
    parts.push('Shift');
  }
  if (shortcut.altKey) {
    parts.push(isMac ? 'Option' : 'Alt');
  }

  parts.push(shortcut.key.toUpperCase());

  return `${parts.join('+')} - ${shortcut.description}`;
}

/**
 * Register keyboard shortcuts with announcements
 * @param shortcuts - Array of keyboard shortcuts
 * @param container - Container element to attach listeners
 * @returns Cleanup function
 */
export function registerKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  container: HTMLElement
): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrlKey ? event.ctrlKey : true;
      const metaMatch = shortcut.metaKey ? event.metaKey : true;
      const shiftMatch = shortcut.shiftKey ? event.shiftKey : !event.shiftKey;
      const altMatch = shortcut.altKey ? event.altKey : !event.altKey;

      if (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        ctrlMatch &&
        metaMatch &&
        shiftMatch &&
        altMatch
      ) {
        event.preventDefault();
        shortcut.action();
        announceToScreenReader(shortcut.description);
        break;
      }
    }
  };

  container.addEventListener('keydown', handleKeyDown);

  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Set ARIA attributes for an element
 * @param element - Element to update
 * @param attributes - ARIA attributes
 */
export function setAriaAttributes(
  element: HTMLElement,
  attributes: Record<string, string | boolean | number>
): void {
  for (const [key, value] of Object.entries(attributes)) {
    const attrName = key.startsWith('aria-') ? key : `aria-${key}`;
    element.setAttribute(attrName, String(value));
  }
}

/**
 * Create a visually hidden element (accessible to screen readers)
 * @param text - Text content
 * @returns Visually hidden element
 */
export function createVisuallyHidden(text: string): HTMLElement {
  const element = document.createElement('span');
  element.textContent = text;
  element.style.position = 'absolute';
  element.style.left = '-10000px';
  element.style.width = '1px';
  element.style.height = '1px';
  element.style.overflow = 'hidden';
  element.setAttribute('aria-hidden', 'false');
  return element;
}

/**
 * Update ARIA live region
 * @param id - Live region ID
 * @param message - Message to announce
 * @param politeness - Politeness level
 */
export function updateAriaLive(
  id: string,
  message: string,
  politeness: AriaLive = 'polite'
): void {
  let liveRegion = document.getElementById(id);

  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = id;
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', politeness);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  }

  liveRegion.textContent = message;
}

/**
 * Check if reduced motion is preferred
 * @returns True if reduced motion is preferred
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Check if high contrast is enabled
 * @returns True if high contrast is enabled
 */
export function prefersHighContrast(): boolean {
  return window.matchMedia('(prefers-contrast: high)').matches;
}

/**
 * Get accessible color contrast ratio
 * @param foreground - Foreground color (hex)
 * @param background - Background color (hex)
 * @returns Contrast ratio
 */
export function getContrastRatio(foreground: string, background: string): number {
  const getLuminance = (color: string): number => {
    const rgb = parseInt(color.slice(1), 16);
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;

    const [rs, gs, bs] = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}
