import { describe, expect, it } from 'vitest';
import { createBlockNode, createTextNode } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { detectTextDirection, findSiblingDirection } from './DirectionDetection.js';
import { TextDirectionPlugin } from './TextDirectionPlugin.js';

const HARNESS_OPTIONS = { useMiddleware: true, builtinSpecs: true } as const;

describe('detectTextDirection', () => {
	it('returns rtl for Arabic text', () => {
		expect(detectTextDirection('مرحبا')).toBe('rtl');
	});

	it('returns rtl for Hebrew text', () => {
		expect(detectTextDirection('שלום')).toBe('rtl');
	});

	it('returns ltr for Latin text', () => {
		expect(detectTextDirection('Hello')).toBe('ltr');
	});

	it('returns null for neutral-only text', () => {
		expect(detectTextDirection('123 !@#')).toBeNull();
	});

	it('returns rtl when RTL appears before LTR', () => {
		expect(detectTextDirection('مرحبا Hello')).toBe('rtl');
	});

	it('returns ltr when LTR appears before RTL', () => {
		expect(detectTextDirection('Hello مرحبا')).toBe('ltr');
	});

	it('returns null for empty string', () => {
		expect(detectTextDirection('')).toBeNull();
	});

	// --- Extended Unicode coverage ---

	it("returns rtl for N'Ko text", () => {
		expect(detectTextDirection('\u07C0\u07C1\u07C2')).toBe('rtl');
	});

	it('returns rtl for Samaritan text', () => {
		expect(detectTextDirection('\u0800\u0801\u0802')).toBe('rtl');
	});

	it('returns rtl for Mandaic text', () => {
		expect(detectTextDirection('\u0840\u0841\u0842')).toBe('rtl');
	});

	it('returns ltr for Armenian text', () => {
		expect(detectTextDirection('\u0531\u0532\u0533')).toBe('ltr');
	});

	it('returns ltr for Devanagari text', () => {
		expect(detectTextDirection('\u0905\u0906\u0907')).toBe('ltr');
	});

	it('returns ltr for Thai text', () => {
		expect(detectTextDirection('\u0E01\u0E02\u0E03')).toBe('ltr');
	});

	it('returns ltr for Georgian text', () => {
		expect(detectTextDirection('\u10A0\u10A1\u10A2')).toBe('ltr');
	});

	// --- Supplementary plane scripts ---

	it('returns rtl for Adlam text', () => {
		expect(detectTextDirection('\u{1E900}\u{1E901}\u{1E902}')).toBe('rtl');
	});

	it('returns rtl for Hanifi Rohingya text', () => {
		expect(detectTextDirection('\u{10D00}\u{10D01}\u{10D02}')).toBe('rtl');
	});

	it('returns rtl when Adlam appears before Latin', () => {
		expect(detectTextDirection('\u{1E900}Hello')).toBe('rtl');
	});

	// --- Unicode directional control characters ---

	it('returns rtl for RLM (Right-to-Left Mark) before Latin', () => {
		expect(detectTextDirection('\u200FHello')).toBe('rtl');
	});

	it('returns rtl for ALM (Arabic Letter Mark) before Latin', () => {
		expect(detectTextDirection('\u061CHello')).toBe('rtl');
	});

	it('returns ltr for LRM (Left-to-Right Mark) before Arabic', () => {
		expect(detectTextDirection('\u200Eمرحبا')).toBe('ltr');
	});

	it('returns rtl when RLM precedes Latin text', () => {
		expect(detectTextDirection('\u200FHello World')).toBe('rtl');
	});

	it('returns ltr when LRM precedes Arabic text', () => {
		expect(detectTextDirection('\u200Eمرحبا عالم')).toBe('ltr');
	});
});

describe('findSiblingDirection', () => {
	it('walks back past auto siblings to find explicit direction', async () => {
		const state = stateBuilder()
			.block('paragraph', 'RTL text', 'b1', { attrs: { dir: 'rtl' } })
			.block('paragraph', 'Auto text', 'b2', { attrs: { dir: 'auto' } })
			.cursor('b2', 0)
			.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
			.build();
		const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

		const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b3' as BlockId);
		const tr = h.getState().transaction('command').insertNode([], 2, newBlock).build();
		h.dispatch(tr);

		const doc = h.getState().doc;
		expect(doc.children[2]?.attrs?.dir).toBe('rtl');
	});

	it('walks forward at index 0 to find explicit direction', async () => {
		const state = stateBuilder()
			.block('paragraph', 'RTL text', 'b1', { attrs: { dir: 'rtl' } })
			.cursor('b1', 0)
			.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
			.build();
		const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

		const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b0' as BlockId);
		const tr = h.getState().transaction('command').insertNode([], 0, newBlock).build();
		h.dispatch(tr);

		const doc = h.getState().doc;
		expect(doc.children[0]?.attrs?.dir).toBe('rtl');
	});

	it('returns undefined at index 0 when all siblings have auto direction', async () => {
		const state = stateBuilder()
			.block('paragraph', 'Auto text', 'b1', { attrs: { dir: 'auto' } })
			.cursor('b1', 0)
			.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
			.build();
		const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

		const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b0' as BlockId);
		const tr = h.getState().transaction('command').insertNode([], 0, newBlock).build();
		h.dispatch(tr);

		const doc = h.getState().doc;
		const dir = doc.children[0]?.attrs?.dir;
		expect(dir === undefined || dir === 'auto').toBe(true);
	});

	it('walks forward past auto siblings to find explicit direction', async () => {
		const state = stateBuilder()
			.block('paragraph', 'Auto text', 'b1', { attrs: { dir: 'auto' } })
			.block('paragraph', 'RTL text', 'b2', { attrs: { dir: 'rtl' } })
			.cursor('b1', 0)
			.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
			.build();
		const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

		const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b0' as BlockId);
		const tr = h.getState().transaction('command').insertNode([], 0, newBlock).build();
		h.dispatch(tr);

		const doc = h.getState().doc;
		expect(doc.children[0]?.attrs?.dir).toBe('rtl');
	});

	it('backward walk takes priority over forward walk', async () => {
		const state = stateBuilder()
			.block('paragraph', 'LTR text', 'b1', { attrs: { dir: 'ltr' } })
			.block('paragraph', 'RTL text', 'b2', { attrs: { dir: 'rtl' } })
			.cursor('b1', 0)
			.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
			.build();
		const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

		const newBlock = createBlockNode('paragraph', [createTextNode('')], 'bm' as BlockId);
		const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
		h.dispatch(tr);

		const doc = h.getState().doc;
		expect(doc.children[1]?.attrs?.dir).toBe('ltr');
	});
});
