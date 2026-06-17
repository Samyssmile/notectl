import { describe, expect, it } from 'vitest';
import {
	normalizeKeyDescriptor,
	physicalBaseKey,
	physicalKeyDescriptors,
} from './KeyDescriptor.js';

function makeKeyEvent(
	key: string,
	opts: {
		code?: string;
		ctrlKey?: boolean;
		metaKey?: boolean;
		shiftKey?: boolean;
		altKey?: boolean;
	} = {},
): KeyboardEvent {
	return new KeyboardEvent('keydown', {
		key,
		code: opts.code ?? '',
		ctrlKey: opts.ctrlKey ?? false,
		metaKey: opts.metaKey ?? false,
		shiftKey: opts.shiftKey ?? false,
		altKey: opts.altKey ?? false,
		bubbles: true,
		cancelable: true,
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

	it('ignores event.code (stays layout-aware)', () => {
		const e = makeKeyEvent('ф', { code: 'KeyA', ctrlKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-Ф');
	});
});

describe('physicalKeyDescriptors', () => {
	it('maps Cyrillic Ctrl+ф (KeyA) to Mod-A', () => {
		const e = makeKeyEvent('ф', { code: 'KeyA', ctrlKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-A']);
	});

	it('maps Cyrillic Ctrl+я (KeyZ) to Mod-Z', () => {
		const e = makeKeyEvent('я', { code: 'KeyZ', ctrlKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-Z']);
	});

	it('maps Meta+ф (KeyA) to Mod-A for macOS Cmd shortcuts', () => {
		const e = makeKeyEvent('ф', { code: 'KeyA', metaKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-A']);
	});

	it('hardens Ctrl+Shift+Digit1 to Mod-Shift-1 (base) plus Mod-Shift-! (shifted)', () => {
		const e = makeKeyEvent('!', { code: 'Digit1', ctrlKey: true, shiftKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-Shift-1', 'Mod-Shift-!']);
	});

	it('adds the US-QWERTY shifted glyph for Ctrl+Shift+Period (blockquote Mod-Shift->)', () => {
		const e = makeKeyEvent('Ю', { code: 'Period', ctrlKey: true, shiftKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-Shift-.', 'Mod-Shift->']);
	});

	it('adds the shifted glyph for Ctrl+Shift+Equal (font size Mod-Shift-+)', () => {
		const e = makeKeyEvent('Ъ', { code: 'Equal', ctrlKey: true, shiftKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-Shift-=', 'Mod-Shift-+']);
	});

	it('adds the shifted glyph for Ctrl+Shift+Minus (font size Mod-Shift-_)', () => {
		const e = makeKeyEvent('-', { code: 'Minus', ctrlKey: true, shiftKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-Shift--', 'Mod-Shift-_']);
	});

	it('omits the shifted glyph when Shift is not held', () => {
		const e = makeKeyEvent('.', { code: 'Period', ctrlKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-.']);
	});

	it('does not add a shifted variant for letters (already uppercased)', () => {
		const e = makeKeyEvent('ф', { code: 'KeyA', ctrlKey: true, shiftKey: true });
		expect(physicalKeyDescriptors(e)).toEqual(['Mod-Shift-A']);
	});

	it('returns an empty array without a command modifier', () => {
		const e = makeKeyEvent('ф', { code: 'KeyA' });
		expect(physicalKeyDescriptors(e)).toEqual([]);
	});

	it('returns an empty array for AltGr combinations (Ctrl+Alt without Cmd)', () => {
		const e = makeKeyEvent('@', { code: 'KeyA', ctrlKey: true, altKey: true });
		expect(physicalKeyDescriptors(e)).toEqual([]);
	});

	it('returns an empty array for named keys absent from the base map', () => {
		const e = makeKeyEvent('Enter', { code: 'Enter', ctrlKey: true });
		expect(physicalKeyDescriptors(e)).toEqual([]);
	});
});

describe('physicalBaseKey', () => {
	it('returns the US-QWERTY base letter for a Cyrillic command shortcut', () => {
		const e = makeKeyEvent('я', { code: 'KeyZ', ctrlKey: true });
		expect(physicalBaseKey(e)).toBe('Z');
	});

	it('returns the same letter on Latin layouts (no regression)', () => {
		const e = makeKeyEvent('a', { code: 'KeyA', ctrlKey: true });
		expect(physicalBaseKey(e)).toBe('A');
	});

	it('returns null without a command modifier', () => {
		const e = makeKeyEvent('a', { code: 'KeyA' });
		expect(physicalBaseKey(e)).toBeNull();
	});
});
