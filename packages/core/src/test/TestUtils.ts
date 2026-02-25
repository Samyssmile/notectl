/**
 * Shared test utilities for reducing boilerplate in notectl tests.
 *
 * Provides:
 * - `StateBuilder`: fluent builder for constructing EditorState instances
 * - `PluginHarness`: streamlined plugin initialization with tracking dispatch
 * - `mockPluginContext()`: full mock of PluginContext for popup/render testing
 * - Assertion helpers: `assertDefined`, `expectBlockText`, etc.
 */

import { vi } from 'vitest';
import type { InputRule } from '../input/InputRule.js';
import type { Keymap } from '../input/Keymap.js';
import { registerBuiltinSpecs } from '../model/BuiltinSpecs.js';
import {
	type BlockNode,
	type Mark,
	createBlockNode,
	createDocument,
	type createInlineNode,
	createTextNode,
} from '../model/Document.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import type { Schema } from '../model/Schema.js';
import {
	createCollapsedSelection,
	createGapCursor,
	createNodeSelection,
	createSelection,
} from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import type { Plugin, PluginContext } from '../plugins/Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../plugins/PluginManager.js';
import type { BlockTypePickerEntry } from '../plugins/heading/BlockTypePickerEntry.js';
import type { ToolbarItem } from '../plugins/toolbar/ToolbarItem.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

// ---------------------------------------------------------------------------
// StateBuilder
// ---------------------------------------------------------------------------

interface BlockDef {
	readonly type: string;
	readonly children: readonly (
		| ReturnType<typeof createTextNode>
		| ReturnType<typeof createInlineNode>
	)[];
	readonly id: string;
	readonly attrs?: Record<string, string | number | boolean>;
	readonly nestedBlocks?: readonly BlockNode[];
}

interface StateBuilderConfig {
	blocks: BlockDef[];
	cursorBlockId?: string;
	cursorOffset?: number;
	rangeAnchor?: { blockId: string; offset: number };
	rangeHead?: { blockId: string; offset: number };
	nodeSelectionId?: string;
	nodeSelectionPath?: readonly string[];
	gapCursorBlockId?: string;
	gapCursorSide?: 'before' | 'after';
	gapCursorPath?: readonly string[];
	schema?: {
		nodeTypes?: string[];
		markTypes?: string[];
		getNodeSpec?: Schema['getNodeSpec'];
	};
}

/**
 * Fluent builder for constructing EditorState instances with minimal boilerplate.
 *
 * @example
 * ```ts
 * const state = new StateBuilder()
 *   .paragraph('Hello', 'b1')
 *   .paragraph('World', 'b2', { marks: [{ type: 'bold' }] })
 *   .cursor('b1', 3)
 *   .build();
 * ```
 */
export class StateBuilder {
	private readonly config: StateBuilderConfig = { blocks: [] };

	/** Add a paragraph block. */
	paragraph(
		text: string,
		id: string,
		options?: {
			marks?: readonly Mark[];
			attrs?: Record<string, string | number | boolean>;
		},
	): this {
		return this.block('paragraph', text, id, options);
	}

	/** Add a heading block. */
	heading(text: string, id: string, level: number, options?: { marks?: readonly Mark[] }): this {
		return this.block('heading', text, id, {
			marks: options?.marks,
			attrs: { level },
		});
	}

	/** Add any typed block with text content. */
	block(
		type: string,
		text: string,
		id: string,
		options?: {
			marks?: readonly Mark[];
			attrs?: Record<string, string | number | boolean>;
		},
	): this {
		this.config.blocks.push({
			type,
			children: [createTextNode(text, options?.marks)],
			id,
			attrs: options?.attrs,
		});
		return this;
	}

	/** Add a block with explicit inline children (TextNodes and InlineNodes). */
	blockWithInlines(
		type: string,
		children: readonly (ReturnType<typeof createTextNode> | ReturnType<typeof createInlineNode>)[],
		id: string,
		attrs?: Record<string, string | number | boolean>,
	): this {
		this.config.blocks.push({ type, children, id, attrs });
		return this;
	}

	/** Add a void/leaf block (e.g. horizontal_rule) with no text children. */
	voidBlock(type: string, id: string): this {
		this.config.blocks.push({ type, children: [], id });
		return this;
	}

	/** Add a nested block structure (e.g. table with rows/cells). */
	nestedBlock(block: BlockNode): this {
		this.config.blocks.push({
			type: block.type,
			children: [],
			id: block.id,
			nestedBlocks: [block],
		});
		return this;
	}

	/** Set collapsed cursor position. */
	cursor(blockId: string, offset: number): this {
		this.config.cursorBlockId = blockId;
		this.config.cursorOffset = offset;
		this.config.rangeAnchor = undefined;
		this.config.rangeHead = undefined;
		this.config.nodeSelectionId = undefined;
		return this;
	}

	/** Set a range selection. */
	selection(
		anchor: { blockId: string; offset: number },
		head: { blockId: string; offset: number },
	): this {
		this.config.rangeAnchor = anchor;
		this.config.rangeHead = head;
		this.config.cursorBlockId = undefined;
		this.config.cursorOffset = undefined;
		this.config.nodeSelectionId = undefined;
		return this;
	}

	/** Set a node selection (for void/selectable blocks). */
	nodeSelection(nodeId: string, path?: readonly string[]): this {
		this.config.nodeSelectionId = nodeId;
		this.config.nodeSelectionPath = path;
		this.config.cursorBlockId = undefined;
		this.config.rangeAnchor = undefined;
		this.config.gapCursorBlockId = undefined;
		return this;
	}

	/** Set a gap cursor selection (before or after a void block). */
	gapCursor(blockId: string, side: 'before' | 'after', path?: readonly string[]): this {
		this.config.gapCursorBlockId = blockId;
		this.config.gapCursorSide = side;
		this.config.gapCursorPath = path;
		this.config.cursorBlockId = undefined;
		this.config.rangeAnchor = undefined;
		this.config.nodeSelectionId = undefined;
		return this;
	}

	/** Configure schema node types and mark types. */
	schema(nodeTypes: string[], markTypes: string[], getNodeSpec?: Schema['getNodeSpec']): this {
		this.config.schema = { nodeTypes, markTypes, getNodeSpec };
		return this;
	}

	/** Build the EditorState. */
	build(): EditorState {
		const blockNodes: BlockNode[] = this.config.blocks.map((def) => {
			if (def.nestedBlocks && def.nestedBlocks.length > 0) {
				return def.nestedBlocks[0] as BlockNode;
			}
			return createBlockNode(
				def.type as NodeTypeName,
				def.children as readonly ReturnType<typeof createTextNode>[],
				def.id as BlockId,
				def.attrs,
			);
		});

		const doc = createDocument(blockNodes);

		const sel = this.resolveSelection(blockNodes);

		return EditorState.create({
			doc,
			selection: sel,
			schema: this.config.schema
				? {
						nodeTypes: this.config.schema.nodeTypes ?? ['paragraph'],
						markTypes: this.config.schema.markTypes ?? ['bold', 'italic', 'underline'],
						getNodeSpec: this.config.schema.getNodeSpec,
					}
				: undefined,
		});
	}

	private resolveSelection(
		blockNodes: readonly BlockNode[],
	):
		| ReturnType<typeof createCollapsedSelection>
		| ReturnType<typeof createSelection>
		| ReturnType<typeof createNodeSelection>
		| ReturnType<typeof createGapCursor> {
		if (this.config.gapCursorBlockId && this.config.gapCursorSide) {
			return createGapCursor(
				this.config.gapCursorBlockId as BlockId,
				this.config.gapCursorSide,
				(this.config.gapCursorPath ?? []) as readonly BlockId[],
			);
		}

		if (this.config.nodeSelectionId) {
			return createNodeSelection(
				this.config.nodeSelectionId as BlockId,
				(this.config.nodeSelectionPath ?? []) as readonly BlockId[],
			);
		}

		if (this.config.rangeAnchor && this.config.rangeHead) {
			return createSelection(
				{
					blockId: this.config.rangeAnchor.blockId as BlockId,
					offset: this.config.rangeAnchor.offset,
				},
				{
					blockId: this.config.rangeHead.blockId as BlockId,
					offset: this.config.rangeHead.offset,
				},
			);
		}

		const bid = (this.config.cursorBlockId ?? blockNodes[0]?.id ?? '') as BlockId;
		return createCollapsedSelection(bid, this.config.cursorOffset ?? 0);
	}
}

/**
 * Shorthand factory for StateBuilder.
 *
 * @example
 * ```ts
 * const state = stateBuilder()
 *   .paragraph('Hello', 'b1')
 *   .cursor('b1', 3)
 *   .build();
 * ```
 */
export function stateBuilder(): StateBuilder {
	return new StateBuilder();
}

// ---------------------------------------------------------------------------
// PluginHarness
// ---------------------------------------------------------------------------

/** Return type of `pluginHarness().init()`. */
export interface PluginHarnessResult {
	/** The PluginManager instance. */
	readonly pm: PluginManager;
	/** Spy-wrapped dispatch that tracks calls and applies transactions. */
	readonly dispatch: ReturnType<typeof vi.fn>;
	/** Returns the current (latest) EditorState after all dispatched transactions. */
	getState(): EditorState;
	/** Execute a registered command by name. */
	executeCommand(name: string): boolean;
	/** Get a toolbar item by id. */
	getToolbarItem(id: string): ToolbarItem | undefined;
	/** Get all registered toolbar items. */
	getToolbarItems(): ToolbarItem[];
	/** Get a MarkSpec by type name. */
	getMarkSpec(name: string): MarkSpec | undefined;
	/** Get a NodeSpec by type name. */
	getNodeSpec(name: string): NodeSpec | undefined;
	/** Get all registered keymaps. */
	getKeymaps(): readonly Keymap[];
	/** Get all registered input rules. */
	getInputRules(): readonly InputRule[];
	/** Get all registered block type picker entries, sorted by priority. */
	getBlockTypePickerEntries(): readonly BlockTypePickerEntry[];
}

/** Options for pluginHarness. */
export interface PluginHarnessOptions {
	/** When true, dispatch routes through `pm.dispatchWithMiddleware()`. */
	readonly useMiddleware?: boolean;
	/** When true, registers built-in node specs (paragraph) before plugins. */
	readonly builtinSpecs?: boolean;
}

/**
 * Streamlined plugin test initialization.
 * Replaces the ~20-line `initPlugin()` boilerplate found in every plugin test.
 *
 * Accepts a single plugin or an array of plugins. When `useMiddleware` is true,
 * dispatched transactions are routed through the plugin middleware chain. When
 * `builtinSpecs` is true, built-in node specs (paragraph) are registered before
 * plugin initialization.
 *
 * @example
 * ```ts
 * const h = await pluginHarness(new HeadingPlugin(), state);
 * h.executeCommand('setHeading1');
 * expect(h.getState().doc.children[0]?.type).toBe('heading');
 * expect(h.dispatch).toHaveBeenCalled();
 * ```
 */
export async function pluginHarness(
	plugin: Plugin | readonly Plugin[],
	state?: EditorState,
	options?: PluginHarnessOptions,
): Promise<PluginHarnessResult> {
	const pm = new PluginManager();

	if (options?.builtinSpecs) {
		registerBuiltinSpecs(pm.schemaRegistry);
	}

	const plugins: readonly Plugin[] = Array.isArray(plugin) ? plugin : [plugin];
	for (const p of plugins) {
		pm.register(p);
	}

	let currentState: EditorState = state ?? EditorState.create();

	const useMiddleware: boolean = options?.useMiddleware ?? false;

	const trackingDispatch = vi.fn((tr: Transaction) => {
		if (useMiddleware) {
			pm.dispatchWithMiddleware(tr, currentState, (finalTr: Transaction) => {
				currentState = currentState.apply(finalTr);
			});
		} else {
			currentState = currentState.apply(tr);
		}
	});

	await pm.init({
		getState: () => currentState,
		dispatch: trackingDispatch,
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => document.createElement('div'),
	});

	return {
		pm,
		dispatch: trackingDispatch,
		getState: () => currentState,
		executeCommand: (name: string) => pm.executeCommand(name),
		getToolbarItem: (id: string) => pm.schemaRegistry.getToolbarItem(id),
		getToolbarItems: () => pm.schemaRegistry.getToolbarItems(),
		getMarkSpec: (name: string) => pm.schemaRegistry.getMarkSpec(name),
		getNodeSpec: (name: string) => pm.schemaRegistry.getNodeSpec(name),
		getKeymaps: () => pm.schemaRegistry.getKeymaps(),
		getInputRules: () => pm.schemaRegistry.getInputRules(),
		getBlockTypePickerEntries: () => pm.schemaRegistry.getBlockTypePickerEntries(),
	};
}

// ---------------------------------------------------------------------------
// PluginManagerInitOptions factory
// ---------------------------------------------------------------------------

/**
 * Creates PluginManagerInitOptions with sensible defaults.
 * Overrides are merged on top.
 *
 * @example
 * ```ts
 * await pm.init(makePluginOptions({ getState: () => myState, dispatch }));
 * ```
 */
export function makePluginOptions(
	overrides?: Partial<PluginManagerInitOptions>,
): PluginManagerInitOptions {
	return {
		getState: () => EditorState.create(),
		dispatch: vi.fn(),
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => document.createElement('div'),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Mock PluginContext
// ---------------------------------------------------------------------------

/**
 * Creates a fully mocked PluginContext.
 * Useful for testing `renderPopup` and other functions that require a PluginContext.
 *
 * @example
 * ```ts
 * const ctx = mockPluginContext({ getState: () => state, dispatch });
 * item?.renderPopup?.(container, ctx);
 * ```
 */
export function mockPluginContext(overrides?: Partial<PluginContext>): PluginContext {
	return {
		getState: overrides?.getState ?? (() => EditorState.create()),
		dispatch: overrides?.dispatch ?? vi.fn(),
		getContainer: overrides?.getContainer ?? (() => document.createElement('div')),
		getPluginContainer: overrides?.getPluginContainer ?? (() => document.createElement('div')),
		registerCommand: vi.fn(),
		executeCommand: vi.fn(() => false),
		getEventBus: vi.fn() as never,
		registerMiddleware: vi.fn(),
		registerService: vi.fn(),
		getService: vi.fn(),
		updateConfig: vi.fn(),
		registerNodeSpec: vi.fn(),
		registerMarkSpec: vi.fn(),
		registerNodeView: vi.fn(),
		registerKeymap: vi.fn(),
		registerInputRule: vi.fn(),
		registerToolbarItem: vi.fn(),
		registerInlineNodeSpec: vi.fn(),
		registerFileHandler: vi.fn(),
		registerBlockTypePickerEntry: vi.fn(),
		getSchemaRegistry: vi.fn() as never,
		announce: overrides?.announce ?? vi.fn(),
		...overrides,
	} as PluginContext;
}

// ---------------------------------------------------------------------------
// Assertion Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a value is defined (not undefined/null).
 * Provides type narrowing for subsequent code.
 */
export function assertDefined<T>(value: T | undefined | null, msg?: string): asserts value is T {
	if (value === undefined || value === null) {
		throw new Error(msg ?? 'Expected value to be defined');
	}
}
