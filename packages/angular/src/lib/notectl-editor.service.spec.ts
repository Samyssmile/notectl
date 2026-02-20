import { describe, expect, it } from 'vitest';
import { NotectlEditorService } from './notectl-editor.service.js';

/**
 * Unit tests for NotectlEditorService.
 *
 * Verifies the service class and its public API surface.
 * Full DI integration tests require Angular TestBed.
 */
describe('NotectlEditorService', () => {
	it('should be defined as a class', () => {
		expect(NotectlEditorService).toBeDefined();
		expect(typeof NotectlEditorService).toBe('function');
	});

	it('should define public API methods on the prototype', () => {
		const proto = NotectlEditorService.prototype;
		expect(typeof proto.register).toBe('function');
		expect(typeof proto.unregister).toBe('function');
		expect(typeof proto.executeCommand).toBe('function');
		expect(typeof proto.getState).toBe('function');
		expect(typeof proto.dispatch).toBe('function');
	});
});
