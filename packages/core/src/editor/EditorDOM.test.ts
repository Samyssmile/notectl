import { describe, expect, it } from 'vitest';
import { createEditorDOM } from './EditorDOM.js';

describe('createEditorDOM', () => {
	it('creates all required elements', () => {
		const dom = createEditorDOM({});
		expect(dom.wrapper).toBeInstanceOf(HTMLElement);
		expect(dom.content).toBeInstanceOf(HTMLElement);
		expect(dom.topPluginContainer).toBeInstanceOf(HTMLElement);
		expect(dom.bottomPluginContainer).toBeInstanceOf(HTMLElement);
		expect(dom.announcer).toBeInstanceOf(HTMLElement);
	});

	it('sets correct class names', () => {
		const dom = createEditorDOM({});
		expect(dom.wrapper.className).toBe('notectl-editor');
		expect(dom.content.className).toBe('notectl-content');
		expect(dom.topPluginContainer.className).toBe('notectl-plugin-container--top');
		expect(dom.bottomPluginContainer.className).toBe('notectl-plugin-container--bottom');
		expect(dom.announcer.className).toBe('notectl-sr-only');
	});

	it('sets ARIA attributes on content element', () => {
		const dom = createEditorDOM({});
		expect(dom.content.getAttribute('role')).toBe('textbox');
		expect(dom.content.getAttribute('aria-multiline')).toBe('true');
		expect(dom.content.getAttribute('aria-label')).toBe('Rich text editor');
		expect(dom.content.getAttribute('aria-description')).toBe('Press Escape to exit the editor');
	});

	it('sets default placeholder', () => {
		const dom = createEditorDOM({});
		expect(dom.content.getAttribute('data-placeholder')).toBe('Start typing...');
	});

	it('uses custom placeholder', () => {
		const dom = createEditorDOM({ placeholder: 'Write here...' });
		expect(dom.content.getAttribute('data-placeholder')).toBe('Write here...');
	});

	it('makes content editable by default', () => {
		const dom = createEditorDOM({});
		expect(dom.content.contentEditable).toBe('true');
	});

	it('makes content non-editable when readonly', () => {
		const dom = createEditorDOM({ readonly: true });
		expect(dom.content.contentEditable).toBe('false');
		expect(dom.content.getAttribute('aria-readonly')).toBe('true');
	});

	it('sets announcer as live region', () => {
		const dom = createEditorDOM({});
		expect(dom.announcer.getAttribute('aria-live')).toBe('polite');
		expect(dom.announcer.getAttribute('aria-atomic')).toBe('true');
	});

	it('assembles correct element hierarchy', () => {
		const dom = createEditorDOM({});
		const children = Array.from(dom.wrapper.children);
		expect(children).toHaveLength(4);
		expect(children[0]).toBe(dom.topPluginContainer);
		expect(children[1]).toBe(dom.content);
		expect(children[2]).toBe(dom.bottomPluginContainer);
		expect(children[3]).toBe(dom.announcer);
	});
});
