import { describe, expect, it, vi } from 'vitest';
import { LanguageRegistry } from './LanguageRegistry.js';
import type { LanguageSupport } from './LanguageTypes.js';

function createStubSupport(id: string): LanguageSupport {
	return { id, displayName: id.toUpperCase() };
}

describe('LanguageRegistry', () => {
	it('stores a bundle and retrieves it by id', () => {
		const registry = new LanguageRegistry();
		const support: LanguageSupport = createStubSupport('java');

		registry.register(support);

		expect(registry.get('java')).toBe(support);
	});

	it('returns undefined for unknown id', () => {
		const registry = new LanguageRegistry();

		expect(registry.get('unknown')).toBeUndefined();
	});

	it('returns all registered bundles', () => {
		const registry = new LanguageRegistry();
		const java: LanguageSupport = createStubSupport('java');
		const json: LanguageSupport = createStubSupport('json');

		registry.register(java);
		registry.register(json);

		const all: readonly LanguageSupport[] = registry.getAll();
		expect(all).toHaveLength(2);
		expect(all).toContain(java);
		expect(all).toContain(json);
	});

	it('overwrites existing bundle with same id', () => {
		const registry = new LanguageRegistry();
		const v1: LanguageSupport = { id: 'java', displayName: 'Java v1' };
		const v2: LanguageSupport = { id: 'java', displayName: 'Java v2' };

		registry.register(v1);
		registry.register(v2);

		expect(registry.get('java')).toBe(v2);
		expect(registry.getAll()).toHaveLength(1);
	});

	it('notifies listeners on future registrations', () => {
		const registry = new LanguageRegistry();
		const listener = vi.fn();

		registry.onRegister(listener);
		const support: LanguageSupport = createStubSupport('python');
		registry.register(support);

		expect(listener).toHaveBeenCalledWith(support);
	});

	it('replays existing bundles to late subscribers', () => {
		const registry = new LanguageRegistry();
		const java: LanguageSupport = createStubSupport('java');
		const json: LanguageSupport = createStubSupport('json');
		registry.register(java);
		registry.register(json);

		const listener = vi.fn();
		registry.onRegister(listener);

		expect(listener).toHaveBeenCalledTimes(2);
		expect(listener).toHaveBeenCalledWith(java);
		expect(listener).toHaveBeenCalledWith(json);
	});

	it('replays then receives future registrations', () => {
		const registry = new LanguageRegistry();
		const java: LanguageSupport = createStubSupport('java');
		registry.register(java);

		const listener = vi.fn();
		registry.onRegister(listener);

		const python: LanguageSupport = createStubSupport('python');
		registry.register(python);

		expect(listener).toHaveBeenCalledTimes(2);
		expect(listener).toHaveBeenNthCalledWith(1, java);
		expect(listener).toHaveBeenNthCalledWith(2, python);
	});

	it('notifies multiple listeners', () => {
		const registry = new LanguageRegistry();
		const listener1 = vi.fn();
		const listener2 = vi.fn();

		registry.onRegister(listener1);
		registry.onRegister(listener2);

		const support: LanguageSupport = createStubSupport('rust');
		registry.register(support);

		expect(listener1).toHaveBeenCalledWith(support);
		expect(listener2).toHaveBeenCalledWith(support);
	});

	it('preserves registration order in getAll', () => {
		const registry = new LanguageRegistry();
		registry.register(createStubSupport('java'));
		registry.register(createStubSupport('json'));
		registry.register(createStubSupport('xml'));

		const ids: readonly string[] = registry.getAll().map((s) => s.id);
		expect(ids).toEqual(['java', 'json', 'xml']);
	});
});
