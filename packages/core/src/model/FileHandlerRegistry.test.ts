import { describe, expect, it, vi } from 'vitest';
import type { FileHandler } from './FileHandlerRegistry.js';
import { FileHandlerRegistry } from './FileHandlerRegistry.js';

describe('FileHandlerRegistry', () => {
	it('registers and retrieves file handlers', () => {
		const registry = new FileHandlerRegistry();
		const handler: FileHandler = vi.fn();
		registry.registerFileHandler('image/png', handler);

		const entries = registry.getFileHandlers();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.pattern).toBe('image/png');
		expect(entries[0]?.handler).toBe(handler);
	});

	it('matches handlers by exact MIME type', () => {
		const registry = new FileHandlerRegistry();
		const handler: FileHandler = vi.fn();
		registry.registerFileHandler('image/png', handler);

		const matched = registry.matchFileHandlers('image/png');
		expect(matched).toEqual([handler]);
	});

	it('matches handlers by wildcard pattern image/*', () => {
		const registry = new FileHandlerRegistry();
		const handler: FileHandler = vi.fn();
		registry.registerFileHandler('image/*', handler);

		expect(registry.matchFileHandlers('image/png')).toEqual([handler]);
		expect(registry.matchFileHandlers('image/jpeg')).toEqual([handler]);
	});

	it('matches handlers by universal wildcard */*', () => {
		const registry = new FileHandlerRegistry();
		const handler: FileHandler = vi.fn();
		registry.registerFileHandler('*/*', handler);

		expect(registry.matchFileHandlers('image/png')).toEqual([handler]);
		expect(registry.matchFileHandlers('application/pdf')).toEqual([handler]);
	});

	it('returns empty array for unmatched MIME type', () => {
		const registry = new FileHandlerRegistry();
		const handler: FileHandler = vi.fn();
		registry.registerFileHandler('image/png', handler);

		expect(registry.matchFileHandlers('text/plain')).toEqual([]);
	});

	it('removes a file handler', () => {
		const registry = new FileHandlerRegistry();
		const handler: FileHandler = vi.fn();
		registry.registerFileHandler('image/png', handler);
		registry.removeFileHandler(handler);

		expect(registry.getFileHandlers()).toHaveLength(0);
		expect(registry.matchFileHandlers('image/png')).toEqual([]);
	});

	it('clear removes all handlers', () => {
		const registry = new FileHandlerRegistry();
		registry.registerFileHandler('image/png', vi.fn());
		registry.registerFileHandler('text/*', vi.fn());
		registry.clear();
		expect(registry.getFileHandlers()).toHaveLength(0);
	});
});
