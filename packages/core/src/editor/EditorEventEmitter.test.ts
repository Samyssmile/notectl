import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../plugins/Logger.js';
import { EditorEventEmitter } from './EditorEventEmitter.js';

function capturingLogger(): Logger {
	return {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	};
}

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

	it('isolates a failing listener, reports it, and continues delivery', () => {
		const logger = capturingLogger();
		const emitter = new EditorEventEmitter(logger);
		const error = new Error('consumer listener failed');
		const laterListener = vi.fn();
		emitter.on('focus', () => {
			throw error;
		});
		emitter.on('focus', laterListener);

		expect(() => emitter.emit('focus', undefined)).not.toThrow();

		expect(laterListener).toHaveBeenCalledWith(undefined);
		expect(logger.error).toHaveBeenCalledWith(
			'[EditorEventEmitter] Listener error on "focus"',
			error,
		);
	});

	it('continues delivery when both a listener and the configured logger fail', () => {
		const logger = capturingLogger();
		vi.mocked(logger.error).mockImplementation(() => {
			throw new Error('logger failed');
		});
		const emitter = new EditorEventEmitter(logger);
		const laterListener = vi.fn();
		emitter.on('focus', () => {
			throw new Error('listener failed');
		});
		emitter.on('focus', laterListener);

		expect(() => emitter.emit('focus', undefined)).not.toThrow();
		expect(laterListener).toHaveBeenCalledOnce();
	});

	it('reports an asynchronously rejected listener without interrupting delivery', async () => {
		const logger = capturingLogger();
		const emitter = new EditorEventEmitter(logger);
		const error = new Error('async consumer listener failed');
		const laterListener = vi.fn();
		emitter.on('focus', async () => {
			throw error;
		});
		emitter.on('focus', laterListener);

		expect(() => emitter.emit('focus', undefined)).not.toThrow();
		expect(laterListener).toHaveBeenCalledOnce();
		await Promise.resolve();

		expect(logger.error).toHaveBeenCalledWith(
			'[EditorEventEmitter] Listener error on "focus"',
			error,
		);
	});

	it('safely observes a hostile thenable returned by a listener', async () => {
		const logger = capturingLogger();
		const emitter = new EditorEventEmitter(logger);
		const error = new Error('then accessor failed');
		const hostileThenable = Object.defineProperty({}, 'then', {
			get(): never {
				throw error;
			},
		});
		const laterListener = vi.fn();
		emitter.on('blur', () => hostileThenable);
		emitter.on('blur', laterListener);

		expect(() => emitter.emit('blur', undefined)).not.toThrow();
		expect(laterListener).toHaveBeenCalledOnce();
		await Promise.resolve();

		expect(logger.error).toHaveBeenCalledWith(
			'[EditorEventEmitter] Listener error on "blur"',
			error,
		);
	});

	it('contains logger failures while reporting an asynchronous rejection', async () => {
		const logger = capturingLogger();
		vi.mocked(logger.error).mockImplementation(() => {
			throw new Error('logger failed');
		});
		const emitter = new EditorEventEmitter(logger);
		emitter.on('ready', async () => {
			throw new Error('async listener failed');
		});

		emitter.emit('ready', undefined);
		await Promise.resolve();
		await Promise.resolve();

		expect(logger.error).toHaveBeenCalledOnce();
	});

	it('observes a rejected promise returned by the logger without leaking it', async () => {
		let rejectLogger = (_reason: unknown): void => {};
		const loggerResult = new Promise<void>((_resolve, reject) => {
			rejectLogger = reject;
		});
		const guardedLoggerResult = loggerResult.catch(() => undefined);
		const thenSpy = vi.spyOn(loggerResult, 'then');
		const logger = capturingLogger();
		vi.mocked(logger.error).mockImplementation(() => loggerResult);
		const emitter = new EditorEventEmitter(logger);
		emitter.on('ready', () => {
			throw new Error('listener failed');
		});

		emitter.emit('ready', undefined);
		rejectLogger(new Error('async logger failed'));
		await guardedLoggerResult;
		await Promise.resolve();

		expect(logger.error).toHaveBeenCalledOnce();
		expect(thenSpy).toHaveBeenCalled();
	});

	it('safely consumes a hostile thenable returned by the logger', async () => {
		const thenAccessed = vi.fn();
		const hostileLoggerResult = Object.defineProperty({}, 'then', {
			get(): never {
				thenAccessed();
				throw new Error('logger then accessor failed');
			},
		});
		const logger: Logger = {
			error: vi.fn(() => hostileLoggerResult),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		};
		const emitter = new EditorEventEmitter(logger);
		emitter.on('focus', () => {
			throw new Error('listener failed');
		});

		emitter.emit('focus', undefined);
		await Promise.resolve();

		expect(thenAccessed).toHaveBeenCalledOnce();
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
