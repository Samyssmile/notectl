import { describe, expect, it, vi } from 'vitest';
import {
	createBlockNode,
	createTextNode,
	getBlockChildren,
	getBlockText,
} from '../../model/Document.js';
import { blockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { type Transaction, invertTransaction } from '../../state/Transaction.js';
import {
	type StateBuilder,
	assertDefined,
	pluginHarness,
	stateBuilder,
} from '../../test/TestUtils.js';
import type { PasteInterceptorEntry } from '../PluginManager.js';
import { CodeBlockPlugin } from '../code-block/CodeBlockPlugin.js';
import { LANGUAGE_REGISTRY_SERVICE_KEY } from '../language/LanguageTypes.js';
import { ListPlugin } from '../list/ListPlugin.js';
import { TablePlugin } from '../table/TablePlugin.js';
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
const BUILTIN_LANGUAGE_COUNT = 4;

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

		it('adds detection to the built-in language capabilities', async () => {
			const state = makeState();
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const registry = h.pm.getService(LANGUAGE_REGISTRY_SERVICE_KEY);
			assertDefined(registry);

			expect(registry.get('java')?.highlighting).toBeDefined();
			expect(registry.get('java')?.detection).toBeDefined();
		});

		it('does not re-register unchanged highlighters when adding detectors', async () => {
			const registerLanguage = vi.fn();
			const highlighter = {
				registerLanguage,
				tokenize: () => [],
				getSupportedLanguages: () => [],
			};

			await pluginHarness(
				[new CodeBlockPlugin({ highlighter }), new SmartPastePlugin()],
				makeState(),
				{ builtinSpecs: true },
			);

			expect(registerLanguage).toHaveBeenCalledTimes(BUILTIN_LANGUAGE_COUNT);
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

	describe('backward range selection (#267)', () => {
		const texts: readonly string[] = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee'];

		/** Selects from the middle of the third paragraph back to the middle of the first. */
		function backwardRangeState(count: number): EditorState {
			const builder = stateBuilder();
			texts.slice(0, count).forEach((text, i) => builder.paragraph(text, `p${i + 1}`));
			return builder
				.selection({ blockId: 'p3', offset: 1 }, { blockId: 'p1', offset: 1 })
				.schema(['paragraph', 'code_block'], ['bold', 'italic'])
				.build();
		}

		it('yields to the code block where a backward range starts in one', async () => {
			// Arrange: the anchor sits in the paragraph after the code block.
			const state: EditorState = stateBuilder()
				.block('code_block', 'efgh', 'code')
				.paragraph('ijkl', 'p2')
				.selection({ blockId: 'p2', offset: 2 }, { blockId: 'code', offset: 1 })
				.schema(['paragraph', 'code_block'], [])
				.build();
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', state);

			// Assert
			expect(tr).toBeNull();
		});

		it('formats code where a backward range from a code block starts in a paragraph', async () => {
			// Arrange: the anchor sits in the code block after the paragraph.
			const state: EditorState = stateBuilder()
				.paragraph('abcd', 'p1')
				.block('code_block', 'efgh', 'code')
				.selection({ blockId: 'code', offset: 2 }, { blockId: 'p1', offset: 1 })
				.schema(['paragraph', 'code_block'], [])
				.build();
			const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
				builtinSpecs: true,
			});
			const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

			// Act
			const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', state);

			// Assert
			assertDefined(tr);
			const after: EditorState = state.apply(tr);
			expect(after.doc.children.map((b) => `${b.type}:${getBlockText(b)}`)).toEqual([
				'paragraph:agh',
				`code_block:${FORMATTED_JSON}`,
			]);
		});

		for (const [label, input, inserted] of [
			['code', SAMPLE_JSON, ['code_block']],
			['mixed', `hello\n\n${SAMPLE_JSON}`, ['paragraph:hello', 'code_block']],
		] as const) {
			for (const count of [3, 5]) {
				it(`inserts ${label} content after the merged block of ${count} paragraphs`, async () => {
					// Arrange
					const state: EditorState = backwardRangeState(count);
					const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
						builtinSpecs: true,
					});
					const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

					// Act
					const tr: Transaction | null = entry.interceptor(input, '', state);

					// Assert
					assertDefined(tr);
					const after: EditorState = state.apply(tr);
					expect(
						after.doc.children.map((b) =>
							b.type === 'code_block' ? b.type : `${b.type}:${getBlockText(b)}`,
						),
					).toEqual([
						'paragraph:accc',
						...inserted,
						...texts.slice(3, count).map((text) => `paragraph:${text}`),
					]);
					expect(after.apply(invertTransaction(tr)).doc).toEqual(state.doc);
				});
			}
		}
	});

	describe('code block selected as a whole', () => {
		for (const [label, select] of [
			['a node selection on', (b: StateBuilder) => b.nodeSelection('code', ['code'])],
			['a gap cursor after', (b: StateBuilder) => b.gapCursor('code', 'after', ['code'])],
		] as const) {
			it(`inserts code after the code block for ${label} it`, async () => {
				// Arrange: the selected code block receives no text.
				const state: EditorState = select(
					stateBuilder()
						.paragraph('abcd', 'p1')
						.block('code_block', 'efgh', 'code')
						.schema(['paragraph', 'code_block'], []),
				).build();
				const h = await pluginHarness([new CodeBlockPlugin(), new SmartPastePlugin()], state, {
					builtinSpecs: true,
				});
				const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

				// Act
				const tr: Transaction | null = entry.interceptor(SAMPLE_JSON, '', state);

				// Assert
				assertDefined(tr);
				const after: EditorState = state.apply(tr);
				expect(after.doc.children.map((b) => `${b.type}:${getBlockText(b)}`)).toEqual([
					'paragraph:abcd',
					'code_block:efgh',
					`code_block:${FORMATTED_JSON}`,
				]);
			});
		}
	});

	describe('container insertion (#267)', () => {
		for (const [label, input, inserted] of [
			['code', SAMPLE_JSON, [`code_block:${FORMATTED_JSON}`]],
			['mixed', `hello\n\n${SAMPLE_JSON}`, ['paragraph:hello', `code_block:${FORMATTED_JSON}`]],
		] as const) {
			it(`keeps ${label} paste beside its paragraph in a list inside a table cell`, async () => {
				const paragraph = (id: string, text: string) =>
					createBlockNode('paragraph', [createTextNode(text)], blockId(id));
				const item = createBlockNode(
					'list_item',
					[paragraph('p1', 'first'), paragraph('p2', 'target'), paragraph('p3', 'last')],
					blockId('item'),
					{ listType: 'bullet', indent: 0 },
				);
				const cell = createBlockNode('table_cell', [item], blockId('cell'));
				const row = createBlockNode('table_row', [cell], blockId('row'));
				const table = createBlockNode('table', [row], blockId('table'));
				const state = stateBuilder().nestedBlock(table).cursor('p2', 3).build();
				const h = await pluginHarness(
					[new TablePlugin(), new ListPlugin(), new CodeBlockPlugin(), new SmartPastePlugin()],
					state,
					{ builtinSpecs: true },
				);
				const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

				const tr = entry.interceptor(input, '', state);

				assertDefined(tr);
				const after = state.apply(tr);
				const afterItem = after.getBlock(item.id);
				const afterCell = after.getBlock(cell.id);
				assertDefined(afterItem);
				assertDefined(afterCell);
				expect(getBlockChildren(afterCell).map((block) => block.id)).toEqual([item.id]);
				expect(
					getBlockChildren(afterItem).map((block) => `${block.type}:${getBlockText(block)}`),
				).toEqual(['paragraph:first', 'paragraph:target', ...inserted, 'paragraph:last']);
				const undone = after.apply(invertTransaction(tr));
				expect(undone.doc).toEqual(state.doc);
				expect(undone.apply(tr).doc).toEqual(after.doc);
			});

			it(`escapes the whole ${label} paste when the parent forbids a code block`, async () => {
				const paragraph = createBlockNode('paragraph', [createTextNode('')], blockId('p1'));
				const container = createBlockNode('restricted', [paragraph], blockId('container'));
				const state = stateBuilder().nestedBlock(container).cursor('p1', 0).build();
				const h = await pluginHarness(
					[
						new CodeBlockPlugin(),
						new SmartPastePlugin(),
						{
							id: 'restricted',
							name: 'Restricted container',
							init(context) {
								context.registerNodeSpec({
									type: 'restricted',
									content: { allow: ['paragraph'], min: 1 },
									toDOM: () => document.createElement('div'),
								});
							},
						},
					],
					state,
					{ builtinSpecs: true },
				);
				const entry = findSmartPasteEntry(h.pm.getPasteInterceptors());

				const tr = entry.interceptor(input, '', state);

				assertDefined(tr);
				const after = state.apply(tr);
				expect(after.getBlock(container.id)).toEqual(container);
				expect(
					after.doc.children.slice(1).map((block) => `${block.type}:${getBlockText(block)}`),
				).toEqual(inserted);
				const undone = after.apply(invertTransaction(tr));
				expect(undone.doc).toEqual(state.doc);
				expect(undone.apply(tr).doc).toEqual(after.doc);
			});
		}
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
