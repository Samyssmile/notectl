import { describe, expect, it } from 'vitest';
import { normalizeKeyDescriptor } from './KeyboardHandler.js';

function makeKeyEvent(
	key: string,
	opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
	return new KeyboardEvent('keydown', {
		key,
		ctrlKey: opts.ctrlKey ?? false,
		metaKey: opts.metaKey ?? false,
		shiftKey: opts.shiftKey ?? false,
		altKey: opts.altKey ?? false,
	});
}

describe('normalizeKeyDescriptor', () => {
	it('normalizes Ctrl+B to Mod-B', () => {
		const e = makeKeyEvent('b', { ctrlKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-B');
	});

	it('normalizes Meta+B to Mod-B', () => {
		const e = makeKeyEvent('b', { metaKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-B');
	});

	it('normalizes Ctrl+Shift+1 to Mod-Shift-1', () => {
		const e = makeKeyEvent('1', { ctrlKey: true, shiftKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-Shift-1');
	});

	it('normalizes Enter without modifiers', () => {
		const e = makeKeyEvent('Enter');
		expect(normalizeKeyDescriptor(e)).toBe('Enter');
	});

	it('normalizes Tab', () => {
		const e = makeKeyEvent('Tab');
		expect(normalizeKeyDescriptor(e)).toBe('Tab');
	});

	it('normalizes Space', () => {
		const e = makeKeyEvent(' ');
		expect(normalizeKeyDescriptor(e)).toBe('Space');
	});

	it('normalizes Alt+Shift+A', () => {
		const e = makeKeyEvent('a', { altKey: true, shiftKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Shift-Alt-A');
	});

	it('normalizes Mod+Shift+Alt+K', () => {
		const e = makeKeyEvent('k', { ctrlKey: true, shiftKey: true, altKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-Shift-Alt-K');
	});

	it('uppercases single-character keys', () => {
		const e = makeKeyEvent('z', { ctrlKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-Z');
	});
});
