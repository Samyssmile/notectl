import { describe, expect, it } from 'vitest';
import { ServiceKey } from './Plugin.js';
import { ServiceRegistry } from './ServiceRegistry.js';

describe('ServiceRegistry', () => {
	it('registers and retrieves a service', () => {
		const reg = new ServiceRegistry();
		const key = new ServiceKey<string>('locale');
		reg.register(key, 'en');
		expect(reg.get(key)).toBe('en');
	});

	it('returns undefined for unknown service', () => {
		const reg = new ServiceRegistry();
		const key = new ServiceKey<string>('missing');
		expect(reg.get(key)).toBeUndefined();
	});

	it('throws on duplicate registration', () => {
		const reg = new ServiceRegistry();
		const key = new ServiceKey<string>('locale');
		reg.register(key, 'en');
		expect(() => reg.register(key, 'de')).toThrow('already registered');
	});

	it('removes a service', () => {
		const reg = new ServiceRegistry();
		const key = new ServiceKey<string>('locale');
		reg.register(key, 'en');
		reg.remove(key.id);
		expect(reg.has(key.id)).toBe(false);
		expect(reg.get(key)).toBeUndefined();
	});

	it('clears all services', () => {
		const reg = new ServiceRegistry();
		const k1 = new ServiceKey<string>('a');
		const k2 = new ServiceKey<number>('b');
		reg.register(k1, 'x');
		reg.register(k2, 42);
		reg.clear();
		expect(reg.has('a')).toBe(false);
		expect(reg.has('b')).toBe(false);
	});

	it('exposes raw map', () => {
		const reg = new ServiceRegistry();
		const key = new ServiceKey<string>('locale');
		reg.register(key, 'en');
		expect(reg.rawMap.get('locale')).toBe('en');
	});
});
