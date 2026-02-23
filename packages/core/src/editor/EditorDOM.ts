/**
 * EditorDOM: builds the editor's internal DOM structure.
 * Pure function — returns a struct of freshly created elements.
 */

export interface EditorDOMConfig {
	readonly readonly?: boolean;
	readonly placeholder?: string;
}

export interface EditorDOMElements {
	readonly wrapper: HTMLElement;
	readonly content: HTMLElement;
	readonly topPluginContainer: HTMLElement;
	readonly bottomPluginContainer: HTMLElement;
	readonly announcer: HTMLElement;
}

/** Creates the editor DOM tree and returns references to all key elements. */
export function createEditorDOM(config: EditorDOMConfig): EditorDOMElements {
	const wrapper: HTMLElement = document.createElement('div');
	wrapper.className = 'notectl-editor';

	const topPluginContainer: HTMLElement = document.createElement('div');
	topPluginContainer.className = 'notectl-plugin-container--top';
	topPluginContainer.setAttribute('data-notectl-no-print', '');

	const content: HTMLElement = document.createElement('div');
	content.className = 'notectl-content';
	content.contentEditable = config.readonly ? 'false' : 'true';
	content.setAttribute('role', 'textbox');
	content.setAttribute('aria-multiline', 'true');
	content.setAttribute('aria-label', 'Rich text editor');
	if (config.readonly) {
		content.setAttribute('aria-readonly', 'true');
	}
	content.setAttribute('aria-description', 'Press Escape to exit the editor');
	content.setAttribute('data-placeholder', config.placeholder ?? 'Start typing...');

	const bottomPluginContainer: HTMLElement = document.createElement('div');
	bottomPluginContainer.className = 'notectl-plugin-container--bottom';
	bottomPluginContainer.setAttribute('data-notectl-no-print', '');

	// Screen reader announcer
	const announcer: HTMLElement = document.createElement('div');
	announcer.className = 'notectl-sr-only';
	announcer.setAttribute('data-notectl-no-print', '');
	announcer.setAttribute('aria-live', 'polite');
	announcer.setAttribute('aria-atomic', 'true');

	wrapper.appendChild(topPluginContainer);
	wrapper.appendChild(content);
	wrapper.appendChild(bottomPluginContainer);
	wrapper.appendChild(announcer);

	return { wrapper, content, topPluginContainer, bottomPluginContainer, announcer };
}
