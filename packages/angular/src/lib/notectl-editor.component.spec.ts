import { describe, expect, it } from 'vitest';
import { NotectlEditorComponent } from './notectl-editor.component.js';

/**
 * Unit tests for NotectlEditorComponent.
 *
 * These tests verify the component class metadata and exported API surface.
 * Full integration tests with DOM rendering require Angular TestBed
 * in an Angular CLI project (see examples/angular).
 */
describe('NotectlEditorComponent', () => {
	it('should be defined as a class', () => {
		expect(NotectlEditorComponent).toBeDefined();
		expect(typeof NotectlEditorComponent).toBe('function');
	});

	it('should have expected static properties from Angular decorator', () => {
		// Angular AOT compiler attaches __annotations__ or uses Reflect metadata.
		// We verify the class itself is a valid constructor.
		expect(NotectlEditorComponent.prototype).toBeDefined();
		expect(NotectlEditorComponent.name).toBe('NotectlEditorComponent');
	});

	it('should define public API methods on the prototype', () => {
		const proto = NotectlEditorComponent.prototype;
		expect(typeof proto.getJSON).toBe('function');
		expect(typeof proto.setJSON).toBe('function');
		expect(typeof proto.getHTML).toBe('function');
		expect(typeof proto.setHTML).toBe('function');
		expect(typeof proto.getText).toBe('function');
		expect(typeof proto.can).toBe('function');
		expect(typeof proto.executeCommand).toBe('function');
		expect(typeof proto.configurePlugin).toBe('function');
		expect(typeof proto.dispatch).toBe('function');
		expect(typeof proto.getState).toBe('function');
		expect(typeof proto.setTheme).toBe('function');
		expect(typeof proto.getTheme).toBe('function');
		expect(typeof proto.setReadonly).toBe('function');
		expect(typeof proto.whenReady).toBe('function');
	});
});
