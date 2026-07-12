import { NotectlEditor } from './editor/NotectlEditor.js';

/** Registers the `<notectl-editor>` custom element when a browser registry is available. */
export function registerNotectlEditor(): void {
	if (typeof customElements !== 'undefined' && !customElements.get('notectl-editor')) {
		customElements.define('notectl-editor', NotectlEditor);
	}
}

// Preserve the root package's existing automatic-registration behavior.
registerNotectlEditor();
