import { describe, expect, it, vi } from 'vitest';
import { type Logger, consoleLogger, scopedLogger, silentLogger } from './Logger.js';

describe('consoleLogger', () => {
	it('forwards error with cause to console.error', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const err = new Error('boom');
		consoleLogger.error('failed', err);
		expect(spy).toHaveBeenCalledWith('failed', err);
		spy.mockRestore();
	});

	it('forwards error without cause to console.error', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		consoleLogger.error('failed');
		expect(spy).toHaveBeenCalledWith('failed');
		spy.mockRestore();
	});

	it('routes warn/info/debug to their console counterparts', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

		consoleLogger.warn('w');
		consoleLogger.info('i');
		consoleLogger.debug('d');

		expect(warnSpy).toHaveBeenCalledWith('w');
		expect(infoSpy).toHaveBeenCalledWith('i');
		expect(debugSpy).toHaveBeenCalledWith('d');

		warnSpy.mockRestore();
		infoSpy.mockRestore();
		debugSpy.mockRestore();
	});
});

describe('silentLogger', () => {
	it('never calls the console', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		silentLogger.error('x', new Error());
		silentLogger.warn('y');
		silentLogger.info('z');
		silentLogger.debug('q');

		expect(errSpy).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalled();

		errSpy.mockRestore();
		warnSpy.mockRestore();
	});
});

describe('scopedLogger', () => {
	function makeCapturingLogger(): { logger: Logger; calls: Array<[string, string, unknown]> } {
		const calls: Array<[string, string, unknown]> = [];
		const logger: Logger = {
			error: (message, cause) => calls.push(['error', message, cause]),
			warn: (message, cause) => calls.push(['warn', message, cause]),
			info: (message, cause) => calls.push(['info', message, cause]),
			debug: (message, cause) => calls.push(['debug', message, cause]),
		};
		return { logger, calls };
	}

	it('prepends the scope to every message', () => {
		const { logger, calls } = makeCapturingLogger();
		const scoped = scopedLogger(logger, 'PluginLifecycle');

		scoped.error('onReady failed', new Error('boom'));
		scoped.warn('stale plugin');

		expect(calls).toEqual([
			['error', '[PluginLifecycle] onReady failed', new Error('boom')],
			['warn', '[PluginLifecycle] stale plugin', undefined],
		]);
	});

	it('leaves the underlying logger untouched', () => {
		const { logger, calls } = makeCapturingLogger();
		scopedLogger(logger, 'Scope');
		logger.error('direct', 'cause');
		expect(calls).toEqual([['error', 'direct', 'cause']]);
	});
});
