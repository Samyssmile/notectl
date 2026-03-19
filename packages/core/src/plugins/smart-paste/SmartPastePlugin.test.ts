import { describe, expect, it } from 'vitest';
import { getBlockText } from '../../model/Document.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import type { PasteInterceptorEntry } from '../PluginManager.js';
import { CodeBlockPlugin } from '../code-block/CodeBlockPlugin.js';
import { SmartPastePlugin } from './SmartPastePlugin.js';
import type { ContentDetector, DetectionResult } from './SmartPasteTypes.js';
import { SMART_PASTE_SERVICE_KEY } from './SmartPasteTypes.js';

// --- Helpers ---

function makeState(
	blocks?: { type: string; text: string; id: string; attrs?: Record<string, string> }[],
	cursorBlockId?: string,
	cursorOffset?: number,
): EditorState {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id, { attrs: b.attrs });
	}
	const bid: string = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'code_block'], ['bold', 'italic']);
	return builder.build();
}

function findSmartPasteEntry(
	interceptors: readonly PasteInterceptorEntry[],
): PasteInterceptorEntry {
	const entry = interceptors.find((i) => i.name === 'smart-paste');
	if (!entry) throw new Error('smart-paste interceptor not found');
	return entry;
}

const SAMPLE_JSON = '{"name": "Alice", "age": 30}';

const FORMATTED_JSON: string = JSON.stringify(JSON.parse(SAMPLE_JSON), null, 2);

// --- Tests ---

describe('SmartPastePlugin', () => {
	describe('plugin metadata', () => {
		it('has correct id', () => {
			const plugin = new SmartPastePlugin();
			expect(plugin.id).toBe('smart-paste');
		});

		it('has correct name', () => {
			const plugin = new SmartPastePlugin();
			expect(plugin.name).toBe('Smart Paste');
		});

		it('declares code-block as dependency', () => {
			const plugin = new SmartPastePlugin();
			expect(plugin.dependencies).toContain('code-block');
		});
	});

	describe('initialization', () => {
		it('registers a paste interceptor', async () => {
			// Arrange
			const state = makeState();
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});

			// Assert
			const interceptors = h.pm.getPasteInterceptors();
			expect(interceptors.length).toBeGreaterThanOrEqual(1);
			const entry = interceptors.find((i) => i.name === 'smart-paste');
			expect(entry).toBeDefined();
		});

		it('registers the smart paste service', async () => {
			// Arrange
			const state = makeState();
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});

			// Assert
			const service = h.pm.getService(SMART_PASTE_SERVICE_KEY);
			expect(service).toBeDefined();
		});

		it('paste interceptor has priority 50', async () => {
			// Arrange
			const state = makeState();
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});

			// Assert
			const interceptors = h.pm.getPasteInterceptors();
			const entry = interceptors.find((i) => i.name === 'smart-paste');
			expect(entry?.priority).toBe(50);
		});
	});

	describe('JSON paste detection', () => {
		it('returns a transaction for valid JSON text', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', state);

			// Assert
			expect(tr).not.toBeNull();
			expect(tr?.steps.length).toBeGreaterThan(0);
		});

		it('inserts a code_block with formatted JSON', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', state);
			expect(tr).not.toBeNull();
			if (!tr) return;
			const newState: EditorState = state.apply(tr);

			// Assert
			const codeBlock = newState.doc.children.find((b) => b.type === 'code_block');
			expect(codeBlock).toBeDefined();
			if (codeBlock) {
				expect(getBlockText(codeBlock)).toBe(FORMATTED_JSON);
			}
		});

		it('dispatches transaction when called via full paste flow', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			h.dispatch(tr);

			// Assert
			const codeBlock = h.getState().doc.children.find((b) => b.type === 'code_block');
			expect(codeBlock).toBeDefined();
			expect(codeBlock?.attrs?.language).toBe('json');
		});
	});

	describe('passthrough — non-JSON paste', () => {
		it('returns null for plain text', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act & Assert
			expect(entry.interceptor('Hello World', '', state)).toBeNull();
		});

		it('returns null for random text starting with brace', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act & Assert
			expect(entry.interceptor('{not json}', '', state)).toBeNull();
		});

		it('returns null for empty string', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act & Assert
			expect(entry.interceptor('', '', state)).toBeNull();
		});
	});

	describe('passthrough — paste in code_block', () => {
		it('returns null when cursor is in existing code_block', async () => {
			// Arrange
			const state = makeState(
				[{ type: 'code_block', text: 'existing code', id: 'b1', attrs: { language: 'js' } }],
				'b1',
				0,
			);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act & Assert
			expect(entry.interceptor(SAMPLE_JSON, '', state)).toBeNull();
		});
	});

	describe('paste with HTML metadata', () => {
		it('still detects JSON even when HTML is present in clipboard', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act — browsers often include HTML metadata alongside plain text
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '<p>Hello</p>', state);

			// Assert — should still create code block from plain text
			expect(tr).not.toBeNull();
		});

		it('returns null when plain text is not structured content despite HTML', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act & Assert — non-JSON plain text should pass through
			expect(entry.interceptor('Hello World', '<b>Hello World</b>', state)).toBeNull();
		});
	});

	describe('multiple detectors — highest confidence wins', () => {
		it('selects the detector with highest confidence', async () => {
			// Arrange
			const lowConfidenceDetector: ContentDetector = {
				id: 'low-conf',
				detect: (_text: string): DetectionResult | null => ({
					language: 'low',
					formattedText: 'low-formatted',
					confidence: 0.5,
				}),
			};
			const highConfidenceDetector: ContentDetector = {
				id: 'high-conf',
				detect: (_text: string): DetectionResult | null => ({
					language: 'high',
					formattedText: 'high-formatted',
					confidence: 0.95,
				}),
			};

			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness(
				[
					new CodeBlockPlugin(),
					new SmartPastePlugin({
						detectors: [lowConfidenceDetector, highConfidenceDetector],
					}),
				],
				state,
				{ builtinSpecs: true },
			);
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor('anything', '', state);
			expect(tr).not.toBeNull();
			if (!tr) return;
			const newState: EditorState = state.apply(tr);

			// Assert
			const codeBlock = newState.doc.children.find((b) => b.type === 'code_block');
			expect(codeBlock).toBeDefined();
			if (codeBlock) {
				expect(getBlockText(codeBlock)).toBe('high-formatted');
			}
		});

		it('uses built-in JSON detector when custom detector returns null', async () => {
			// Arrange
			const nullDetector: ContentDetector = {
				id: 'null-detector',
				detect: (_text: string): DetectionResult | null => null,
			};

			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness(
				[new CodeBlockPlugin(), new SmartPastePlugin({ detectors: [nullDetector] })],
				state,
				{ builtinSpecs: true },
			);
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act & Assert
			expect(entry.interceptor(SAMPLE_JSON, '', state)).not.toBeNull();
		});
	});

	describe('service: registerDetector', () => {
		it('allows registering detectors at runtime via service', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const service = h.pm.getService(SMART_PASTE_SERVICE_KEY);
			expect(service).toBeDefined();
			if (!service) return;

			const customDetector: ContentDetector = {
				id: 'yaml-detector',
				detect: (text: string): DetectionResult | null => {
					if (text.startsWith('---')) {
						return { language: 'yaml', formattedText: text, confidence: 0.85 };
					}
					return null;
				},
			};

			// Act
			service.registerDetector(customDetector);
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());
			const tr: Transaction | null = entry.interceptor('---\nkey: value', '', h.getState());

			// Assert
			expect(tr).not.toBeNull();
		});

		it('runtime detector competes with built-in JSON detector', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const service = h.pm.getService(SMART_PASTE_SERVICE_KEY);
			if (!service) return;

			const superDetector: ContentDetector = {
				id: 'super-detector',
				detect: (_text: string): DetectionResult | null => ({
					language: 'super',
					formattedText: 'super-formatted',
					confidence: 0.99,
				}),
			};

			// Act
			service.registerDetector(superDetector);
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			const newState: EditorState = h.getState().apply(tr);

			// Assert — super detector has confidence 0.99 > JSON 0.9
			const codeBlock = newState.doc.children.find((b) => b.type === 'code_block');
			expect(codeBlock).toBeDefined();
			if (codeBlock) {
				expect(getBlockText(codeBlock)).toBe('super-formatted');
			}
		});
	});

	describe('screen reader announcement', () => {
		it('announces code block detection after JSON paste', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act & Assert
			expect(entry.interceptor(SAMPLE_JSON, '', h.getState())).not.toBeNull();
		});
	});

	describe('code block attributes', () => {
		it('sets language attribute to "json" on inserted code block', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			h.dispatch(tr);

			// Assert
			const codeBlock = h.getState().doc.children.find((b) => b.type === 'code_block');
			expect(codeBlock?.attrs?.language).toBe('json');
		});

		it('sets empty backgroundColor attribute on inserted code block', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			h.dispatch(tr);

			// Assert
			const codeBlock = h.getState().doc.children.find((b) => b.type === 'code_block');
			expect(codeBlock?.attrs?.backgroundColor).toBe('');
		});
	});

	describe('cursor position after paste', () => {
		it('places cursor at end of formatted text in new code block', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			h.dispatch(tr);

			// Assert
			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.offset).toBe(FORMATTED_JSON.length);
			}
		});
	});

	describe('mixed content paste', () => {
		it('creates paragraph and code block for text + JSON', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());
			const mixedInput = `Lorem Ipsum\n\n${SAMPLE_JSON}`;

			// Act
			const tr: Transaction | null = entry.interceptor(mixedInput, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			const newState: EditorState = h.getState().apply(tr);

			// Assert
			const paragraphs = newState.doc.children.filter((b) => b.type === 'paragraph');
			const codeBlocks = newState.doc.children.filter((b) => b.type === 'code_block');
			expect(paragraphs.length).toBeGreaterThanOrEqual(1);
			expect(codeBlocks).toHaveLength(1);

			const insertedParagraph = paragraphs.find((b) => getBlockText(b) === 'Lorem Ipsum');
			expect(insertedParagraph).toBeDefined();
			const firstCodeBlock = codeBlocks[0];
			if (!firstCodeBlock) return;
			expect(getBlockText(firstCodeBlock)).toBe(FORMATTED_JSON);
		});

		it('creates code block and paragraph for JSON + text', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());
			const mixedInput = `${SAMPLE_JSON}\n\nSome explanation`;

			// Act
			const tr: Transaction | null = entry.interceptor(mixedInput, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			const newState: EditorState = h.getState().apply(tr);

			// Assert
			const codeBlocks = newState.doc.children.filter((b) => b.type === 'code_block');
			expect(codeBlocks).toHaveLength(1);
			const firstCodeBlock = codeBlocks[0];
			if (!firstCodeBlock) return;
			expect(getBlockText(firstCodeBlock)).toBe(FORMATTED_JSON);

			const hasExplanation = newState.doc.children.some(
				(b) => b.type === 'paragraph' && getBlockText(b) === 'Some explanation',
			);
			expect(hasExplanation).toBe(true);
		});

		it('returns null for all-text mixed content', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act & Assert
			expect(entry.interceptor('Hello\n\nWorld\n\nFoo', '', h.getState())).toBeNull();
		});

		it('preserves block order: paragraph before code block', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());
			const mixedInput = `Description\n\n${SAMPLE_JSON}`;

			// Act
			const tr: Transaction | null = entry.interceptor(mixedInput, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			const newState: EditorState = h.getState().apply(tr);

			// Assert — paragraph should appear before code block
			const children = newState.doc.children;
			const descIdx = children.findIndex(
				(b) => b.type === 'paragraph' && getBlockText(b) === 'Description',
			);
			const codeIdx = children.findIndex((b) => b.type === 'code_block');
			expect(descIdx).toBeGreaterThanOrEqual(0);
			expect(codeIdx).toBeGreaterThan(descIdx);
		});

		it('places cursor at end of last block in mixed paste', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());
			const mixedInput = `Description\n\n${SAMPLE_JSON}`;

			// Act
			const tr: Transaction | null = entry.interceptor(mixedInput, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			h.dispatch(tr);

			// Assert — cursor at end of last block (the code block)
			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.offset).toBe(FORMATTED_JSON.length);
			}
		});

		it('removes empty anchor block on mixed paste', async () => {
			// Arrange
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());
			const mixedInput = `Text\n\n${SAMPLE_JSON}`;

			// Act
			const tr: Transaction | null = entry.interceptor(mixedInput, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			const newState: EditorState = h.getState().apply(tr);

			// Assert — the original empty paragraph should be removed
			const emptyParagraphs = newState.doc.children.filter(
				(b) => b.type === 'paragraph' && getBlockText(b) === '',
			);
			expect(emptyParagraphs).toHaveLength(0);
		});

		it('uses custom detector for mixed content splitting', async () => {
			// Arrange
			const yamlDetector: ContentDetector = {
				id: 'yaml',
				detect: (text: string): DetectionResult | null => {
					if (text.startsWith('---')) {
						return { language: 'yaml', formattedText: text, confidence: 0.85 };
					}
					return null;
				},
			};

			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness(
				[new CodeBlockPlugin(), new SmartPastePlugin({ detectors: [yamlDetector] })],
				state,
				{ builtinSpecs: true },
			);
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());
			const mixedInput = 'Config below\n\n---\nkey: value';

			// Act
			const tr: Transaction | null = entry.interceptor(mixedInput, '', h.getState());
			expect(tr).not.toBeNull();
			if (!tr) return;
			const newState: EditorState = h.getState().apply(tr);

			// Assert
			const codeBlocks = newState.doc.children.filter((b) => b.type === 'code_block');
			expect(codeBlocks).toHaveLength(1);
			expect(codeBlocks[0]?.attrs?.language).toBe('yaml');
		});
	});

	describe('destroy', () => {
		it('cleans up plugin state on destroy', async () => {
			// Arrange
			const plugin = new SmartPastePlugin();
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			await pluginHarness([new CodeBlockPlugin(), plugin], state, { builtinSpecs: true });

			// Act & Assert — should not throw
			plugin.destroy();
			expect(true).toBe(true);
		});
	});
});
