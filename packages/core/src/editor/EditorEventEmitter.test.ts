import { describe, expect, it, vi } from 'vitest';
import { EditorEventEmitter } from './EditorEventEmitter.js';

describe('EditorEventEmitter', () => {
	it('calls listener on emit', () => {
		const emitter = new EditorEventEmitter();
		const spy = vi.fn();
		emitter.on('focus', spy);

		emitter.emit('focus', undefined);

		expect(spy).toHaveBeenCalledOnce();
	});

	it('passes payload to listener', () => {
		const emitter = new EditorEventEmitter();
		const spy = vi.fn();
		emitter.on('ready', spy);

		emitter.emit('ready', undefined);

		expect(spy).toHaveBeenCalledWith(undefined);
	});

	it('supports multiple listeners for the same event', () => {
		const emitter = new EditorEventEmitter();
		const spy1 = vi.fn();
		const spy2 = vi.fn();
		emitter.on('focus', spy1);
		emitter.on('focus', spy2);

		emitter.emit('focus', undefined);

		expect(spy1).toHaveBeenCalledOnce();
		expect(spy2).toHaveBeenCalledOnce();
	});

	it('off removes a listener', () => {
		const emitter = new EditorEventEmitter();
		const spy = vi.fn();
		emitter.on('focus', spy);
		emitter.off('focus', spy);

		emitter.emit('focus', undefined);

		expect(spy).not.toHaveBeenCalled();
	});

	it('off does not affect other listeners', () => {
		const emitter = new EditorEventEmitter();
		const spy1 = vi.fn();
		const spy2 = vi.fn();
		emitter.on('blur', spy1);
		emitter.on('blur', spy2);
		emitter.off('blur', spy1);

		emitter.emit('blur', undefined);

		expect(spy1).not.toHaveBeenCalled();
		expect(spy2).toHaveBeenCalledOnce();
	});

	it('emit does nothing for events with no listeners', () => {
		const emitter = new EditorEventEmitter();

		expect(() => emitter.emit('focus', undefined)).not.toThrow();
	});

	it('clear removes all listeners', () => {
		const emitter = new EditorEventEmitter();
		const focusSpy = vi.fn();
		const blurSpy = vi.fn();
		emitter.on('focus', focusSpy);
		emitter.on('blur', blurSpy);

		emitter.clear();
		emitter.emit('focus', undefined);
		emitter.emit('blur', undefined);

		expect(focusSpy).not.toHaveBeenCalled();
		expect(blurSpy).not.toHaveBeenCalled();
	});

	it('off on non-existent event does not throw', () => {
		const emitter = new EditorEventEmitter();
		const spy = vi.fn();

		expect(() => emitter.off('focus', spy)).not.toThrow();
	});
});
