import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.customElements = window.customElements;
globalThis.ShadowRoot = window.ShadowRoot;
globalThis.Node = window.Node;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

let currentCommandFont = 'Fira Code';
window.document.queryCommandValue = (command) => {
  if (command === 'fontName') {
    return currentCommandFont;
  }
  return '';
};

const { ToolbarPlugin } = await import('../dist/toolbar.js');

class TestPluginContext {
  #listeners = new Map();
  #pluginContainers;

  constructor(container) {
    this.container = container;
    this.#pluginContainers = {
      top: window.document.createElement('div'),
      bottom: window.document.createElement('div'),
    };
    window.document.body.appendChild(this.#pluginContainers.top);
    window.document.body.appendChild(this.#pluginContainers.bottom);
  }

  getState() {
    return {};
  }
  applyDelta() {}
  getSelection() {
    return null;
  }
  setSelection() {}
  getSelectedBlock() {
    return null;
  }
  findBlocksByType() {
    return [];
  }
  findBlockById() {
    return undefined;
  }
  findParentBlock() {
    return null;
  }
  getBlockAtCursor() {
    return null;
  }
  insertBlockAfter() {}
  insertBlockBefore() {}
  updateBlockAttrs() {}
  deleteBlock() {}
  addMark() {}
  removeMark() {}
  toggleMark() {}

  on(event, callback) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(callback);
  }

  off(event, callback) {
    this.#listeners.get(event)?.delete(callback);
  }

  emit(event, data) {
    this.#listeners.get(event)?.forEach((handler) => handler(data));
  }

  registerCommand() {}
  executeCommand() {}

  getContainer() {
    return this.container;
  }

  getPluginContainer(position) {
    return this.#pluginContainers[position];
  }
}

const selectNode = (node) => {
  const selection = window.getSelection();
  selection.removeAllRanges();
  const range = window.document.createRange();
  range.selectNodeContents(node);
  selection.addRange(range);
};

const getFontDropdown = (toolbarHost) =>
  toolbarHost.shadowRoot.querySelector('[data-dropdown-id="font-family"]');

const getFontDropdownLabel = (toolbarHost) => {
  const dropdown = getFontDropdown(toolbarHost);
  return dropdown?.querySelector('.notectl-toolbar-dropdown-label')?.textContent?.trim();
};

test('font dropdown label reflects active selection', async () => {
  try {
    window.document.body.innerHTML = '';
    const editorContainer = window.document.createElement('div');
    window.document.body.appendChild(editorContainer);
    editorContainer.style.fontFamily = '\'Fira Code\'';

    const context = new TestPluginContext(editorContainer);
    const plugin = new ToolbarPlugin({
      fonts: {
        extendDefaults: false,
        families: ['Fira Code', 'Courier New'],
      },
    });

    await plugin.init(context);

    const span = window.document.createElement('span');
    span.style.fontFamily = '\'Fira Code\'';
    span.textContent = 'Sample';
    editorContainer.appendChild(span);

    selectNode(span.firstChild);
    context.emit('selection-change', { selection: null });

    const toolbarHost = context.getPluginContainer('top').querySelector('notectl-toolbar');
    assert.ok(toolbarHost, 'toolbar host rendered');

    assert.equal(getFontDropdownLabel(toolbarHost), 'Fira Code');

    const fontDropdown = getFontDropdown(toolbarHost);
    const courierOption = fontDropdown?.querySelector('[data-value="Courier New"]');
    assert.ok(courierOption, 'Courier New option present');
    courierOption.click();
    currentCommandFont = 'Courier New';
    context.emit('change', {});
    assert.equal(getFontDropdownLabel(toolbarHost), 'Courier New');

    // Simulate typing: command/query results and selection styles revert to defaults
    currentCommandFont = '';
    span.style.fontFamily = '';
    editorContainer.style.fontFamily = 'monospace';
    context.emit('selection-change', { selection: null });
    context.emit('change', {});
    assert.equal(getFontDropdownLabel(toolbarHost), 'Courier New', 'label sticks when detection falls back');

    const labelElements = toolbarHost.shadowRoot.querySelectorAll('.notectl-toolbar-dropdown-label');
    const labels = Array.from(labelElements).map((label) => label.textContent?.trim());

    assert.ok(labels.includes('Courier New'), 'font dropdown label matches selection');

    await plugin.destroy();
  } catch (error) {
    console.error('Font dropdown test error:', error);
    throw error;
  }
});

test('font dropdown prioritizes primary font token order', async () => {
  window.document.body.innerHTML = '';
  currentCommandFont = '';

  const editorContainer = window.document.createElement('div');
  editorContainer.style.fontFamily = `'Fira Code', 'Fira Code VF', monospace`;
  window.document.body.appendChild(editorContainer);

  const context = new TestPluginContext(editorContainer);
  const plugin = new ToolbarPlugin({
    fonts: {
      families: ['Fira Code'],
    },
  });

  await plugin.init(context);

  const span = window.document.createElement('span');
  span.style.fontFamily = `'Fira Code', 'Fira Code VF', monospace`;
  span.textContent = 'Sample';
  editorContainer.appendChild(span);

  selectNode(span.firstChild);
  context.emit('selection-change', { selection: null });

  const toolbarHost = context.getPluginContainer('top').querySelector('notectl-toolbar');
  assert.ok(toolbarHost, 'toolbar host rendered');

  assert.equal(
    getFontDropdownLabel(toolbarHost),
    'Fira Code',
    'dropdown prefers the actual primary font token instead of fallbacks'
  );

  await plugin.destroy();
});
