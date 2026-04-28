import { describe, expect, it } from 'vitest';

import { NotectlEditorComponent } from './notectl-editor.component.js';

describe('NotectlEditorComponent', () => {
	it('is exported as a concrete Angular component class', () => {
		expect(NotectlEditorComponent).toBeDefined();
		expect(typeof NotectlEditorComponent).toBe('function');
		expect(NotectlEditorComponent.name).toBe('NotectlEditorComponent');
	});

	it('exposes the expected imperative editor API', () => {
		const proto = NotectlEditorComponent.prototype;

		expect(typeof proto.getJSON).toBe('function');
		expect(typeof proto.setJSON).toBe('function');
		expect(typeof proto.getContentHTML).toBe('function');
		expect(typeof proto.setContentHTML).toBe('function');
		expect(typeof proto.getText).toBe('function');
		expect(typeof proto.setText).toBe('function');
		expect(typeof proto.can).toBe('function');
		expect(typeof proto.executeCommand).toBe('function');
		expect(typeof proto.configurePlugin).toBe('function');
		expect(typeof proto.dispatch).toBe('function');
		expect(typeof proto.getState).toBe('function');
		expect(typeof proto.setTheme).toBe('function');
		expect(typeof proto.getTheme).toBe('function');
		expect(typeof proto.whenReady).toBe('function');
		expect(typeof proto.focus).toBe('function');
	});

	it('implements the classic forms control contract directly on the component', () => {
		const proto = NotectlEditorComponent.prototype;

		expect(typeof proto.writeValue).toBe('function');
		expect(typeof proto.registerOnChange).toBe('function');
		expect(typeof proto.registerOnTouched).toBe('function');
		expect(typeof proto.setDisabledState).toBe('function');
	});
});
