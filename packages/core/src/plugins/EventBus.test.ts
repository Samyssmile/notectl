import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus.js';
import { EventKey } from './Plugin.js';

const testKey = new EventKey<unknown>('test');
const fooKey = new EventKey<number>('foo');
const eKey = new EventKey<number>('e');
const aKey = new EventKey<number>('a');
const bKey = new EventKey<number>('b');

describe('EventBus', () => {
	it('emits without listeners without error', () => {
		const bus = new EventBus();
		expect(() => bus.emit(fooKey, 42)).not.toThrow();
	});

	it('delivers payload to registered listeners', () => {
		const bus = new EventBus();
		const cb = vi.fn();

		bus.on(testKey, cb);
		bus.emit(testKey, 'hello');

		expect(cb).toHaveBeenCalledWith('hello');
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('supports multiple listeners on the same event', () => {
		const bus = new EventBus();
		const cb1 = vi.fn();
		const cb2 = vi.fn();

		bus.on(eKey, cb1);
		bus.on(eKey, cb2);
		bus.emit(eKey, 1);

		expect(cb1).toHaveBeenCalledWith(1);
		expect(cb2).toHaveBeenCalledWith(1);
	});

	it('removes a listener via off()', () => {
		const bus = new EventBus();
		const cb = vi.fn();

		bus.on(eKey, cb);
		bus.off(eKey, cb);
		bus.emit(eKey, 1);

		expect(cb).not.toHaveBeenCalled();
	});

	it('removes a listener via unsubscribe function', () => {
		const bus = new EventBus();
		const cb = vi.fn();

		const unsub = bus.on(eKey, cb);
		unsub();
		bus.emit(eKey, 1);

		expect(cb).not.toHaveBeenCalled();
	});

	it('isolates errors — other listeners still fire', () => {
		const bus = new EventBus();
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const cb1 = vi.fn(() => {
			throw new Error('boom');
		});
		const cb2 = vi.fn();

		bus.on(eKey, cb1);
		bus.on(eKey, cb2);
		bus.emit(eKey, 'data' as unknown as number);

		expect(cb1).toHaveBeenCalled();
		expect(cb2).toHaveBeenCalledWith('data');
		expect(errSpy).toHaveBeenCalledOnce();

		errSpy.mockRestore();
	});

	it('clear() removes all listeners', () => {
		const bus = new EventBus();
		const cb1 = vi.fn();
		const cb2 = vi.fn();

		bus.on(aKey, cb1);
		bus.on(bKey, cb2);
		bus.clear();

		bus.emit(aKey, 1);
		bus.emit(bKey, 2);

		expect(cb1).not.toHaveBeenCalled();
		expect(cb2).not.toHaveBeenCalled();
	});

	it('off() on unknown event does not throw', () => {
		const bus = new EventBus();
		const nopeKey = new EventKey<void>('nope');
		expect(() => bus.off(nopeKey, () => {})).not.toThrow();
	});

	it('does not deliver to listeners of different events', () => {
		const bus = new EventBus();
		const cb = vi.fn();

		bus.on(aKey, cb);
		bus.emit(bKey, 1);

		expect(cb).not.toHaveBeenCalled();
	});
});
