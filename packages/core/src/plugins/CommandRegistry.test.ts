import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry } from './CommandRegistry.js';

describe('CommandRegistry', () => {
	it('registers and executes a command', () => {
		const reg = new CommandRegistry();
		const handler = vi.fn(() => true);
		reg.register('bold', handler, 'text-formatting');

		expect(reg.execute('bold', false)).toBe(true);
		expect(handler).toHaveBeenCalledOnce();
	});

	it('returns false for unknown command', () => {
		const reg = new CommandRegistry();
		expect(reg.execute('missing', false)).toBe(false);
		expect(reg.canExecute('missing', false)).toBe(false);
	});

	it('throws on duplicate registration', () => {
		const reg = new CommandRegistry();
		reg.register('bold', () => true, 'plugin-a');
		expect(() => reg.register('bold', () => true, 'plugin-b')).toThrow(
			'already registered by plugin "plugin-a"',
		);
	});

	it('blocks non-readonlyAllowed commands when read-only', () => {
		const reg = new CommandRegistry();
		reg.register('bold', () => true, 'p1');
		expect(reg.canExecute('bold', true)).toBe(false);
		expect(reg.execute('bold', true)).toBe(false);
	});

	it('allows readonlyAllowed commands when read-only', () => {
		const reg = new CommandRegistry();
		reg.register('copy', () => true, 'p1', { readonlyAllowed: true });
		expect(reg.canExecute('copy', true)).toBe(true);
		expect(reg.execute('copy', true)).toBe(true);
	});

	it('sets bypass flag during readonlyAllowed execution', () => {
		const reg = new CommandRegistry();
		let bypassDuringExec = false;
		reg.register(
			'copy',
			() => {
				bypassDuringExec = reg.isReadonlyBypassed();
				return true;
			},
			'p1',
			{ readonlyAllowed: true },
		);

		reg.execute('copy', true);
		expect(bypassDuringExec).toBe(true);
		expect(reg.isReadonlyBypassed()).toBe(false);
	});

	it('clears bypass flag even on error', () => {
		const reg = new CommandRegistry();
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		reg.register(
			'fail',
			() => {
				throw new Error('boom');
			},
			'p1',
			{ readonlyAllowed: true },
		);

		expect(reg.execute('fail', true)).toBe(false);
		expect(reg.isReadonlyBypassed()).toBe(false);
		spy.mockRestore();
	});

	it('removes a command', () => {
		const reg = new CommandRegistry();
		reg.register('bold', () => true, 'p1');
		reg.remove('bold');
		expect(reg.has('bold')).toBe(false);
	});

	it('clears all commands', () => {
		const reg = new CommandRegistry();
		reg.register('bold', () => true, 'p1');
		reg.register('italic', () => true, 'p1');
		reg.clear();
		expect(reg.has('bold')).toBe(false);
		expect(reg.has('italic')).toBe(false);
	});
});
