/**
 * Plugin-specific test assertion helpers.
 *
 * Provides composable, single-call assertions for the patterns that repeat
 * across every plugin test file: MarkSpec checks, NodeSpec checks,
 * toolbar-item verification, active-state testing, keymap and command checks.
 *
 * All helpers accept a {@link PluginHarnessResult} and throw via `expect()`
 * so they integrate naturally with vitest's reporting.
 */

import { expect } from 'vitest';
import type { EditorState } from '../state/EditorState.js';
import type { PluginHarnessResult } from './TestUtils.js';

// ---------------------------------------------------------------------------
// MarkSpec assertions
// ---------------------------------------------------------------------------

/** Expected properties when asserting a MarkSpec. */
export interface ExpectedMarkSpec {
	/** Expected HTML tag name (uppercase, e.g. 'STRONG'). */
	readonly tag?: string;
	/** Expected nesting rank. */
	readonly rank?: number;
	/** Expected attr definitions, e.g. `{ color: { default: '' } }`. */
	readonly attrs?: Record<string, unknown>;
	/**
	 * Mark value passed to `toDOM()` for tag-name verification.
	 * Defaults to `{ type: markName }`.
	 */
	readonly toDOMInput?: Record<string, unknown>;
}

/**
 * Assert that a MarkSpec is registered and matches expected properties.
 *
 * @example
 * ```ts
 * const h = await pluginHarness(new StrikethroughPlugin());
 * expectMarkSpec(h, 'strikethrough', { tag: 'S', rank: 3 });
 * ```
 */
export function expectMarkSpec(
	harness: PluginHarnessResult,
	markName: string,
	expected: ExpectedMarkSpec = {},
): void {
	const spec = harness.getMarkSpec(markName);
	expect(spec, `MarkSpec '${markName}' should be registered`).toBeDefined();

	if (expected.rank !== undefined) {
		expect(spec?.rank).toBe(expected.rank);
	}

	if (expected.attrs !== undefined) {
		expect(spec?.attrs).toEqual(expected.attrs);
	}

	if (expected.tag !== undefined) {
		const input = expected.toDOMInput ?? { type: markName };
		const el = spec?.toDOM(input as never);
		expect(el?.tagName, `MarkSpec '${markName}' toDOM should create <${expected.tag}>`).toBe(
			expected.tag,
		);
	}
}

// ---------------------------------------------------------------------------
// NodeSpec assertions
// ---------------------------------------------------------------------------

/** Expected properties when asserting a NodeSpec. */
export interface ExpectedNodeSpec {
	/** Expected HTML tag name (uppercase). */
	readonly tag?: string;
	/** Expected attr definitions. */
	readonly attrs?: Record<string, unknown>;
	/** Expected excludeMarks list. */
	readonly excludeMarks?: readonly string[];
}

/**
 * Assert that a NodeSpec is registered and matches expected properties.
 *
 * @example
 * ```ts
 * const h = await pluginHarness(new BlockquotePlugin());
 * expectNodeSpec(h, 'blockquote', { tag: 'BLOCKQUOTE' });
 * ```
 */
export function expectNodeSpec(
	harness: PluginHarnessResult,
	nodeName: string,
	expected: ExpectedNodeSpec = {},
): void {
	const spec = harness.getNodeSpec(nodeName);
	expect(spec, `NodeSpec '${nodeName}' should be registered`).toBeDefined();

	if (expected.attrs !== undefined) {
		expect(spec?.attrs).toEqual(expected.attrs);
	}

	if (expected.excludeMarks !== undefined) {
		for (const mark of expected.excludeMarks) {
			expect(spec?.excludeMarks, `NodeSpec '${nodeName}' should exclude mark '${mark}'`).toContain(
				mark,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Toolbar item assertions
// ---------------------------------------------------------------------------

/** Expected properties when asserting a toolbar item. */
export interface ExpectedToolbarItem {
	readonly group?: string;
	readonly label?: string;
	readonly command?: string;
	readonly priority?: number;
	readonly popupType?: string;
	readonly hasSvgIcon?: boolean;
	readonly separatorAfter?: boolean;
}

/**
 * Assert that a toolbar item is registered and matches expected properties.
 *
 * @example
 * ```ts
 * const h = await pluginHarness(new StrikethroughPlugin());
 * expectToolbarItem(h, 'strikethrough', {
 *   group: 'format',
 *   label: 'Strikethrough',
 *   command: 'toggleStrikethrough',
 * });
 * ```
 */
export function expectToolbarItem(
	harness: PluginHarnessResult,
	itemId: string,
	expected: ExpectedToolbarItem = {},
): void {
	const item = harness.getToolbarItem(itemId);
	expect(item, `Toolbar item '${itemId}' should be registered`).toBeDefined();

	if (expected.group !== undefined) {
		expect(item?.group).toBe(expected.group);
	}
	if (expected.label !== undefined) {
		expect(item?.label).toBe(expected.label);
	}
	if (expected.command !== undefined) {
		expect(item?.command).toBe(expected.command);
	}
	if (expected.priority !== undefined) {
		expect(item?.priority).toBe(expected.priority);
	}
	if (expected.popupType !== undefined) {
		expect(item?.popupType).toBe(expected.popupType);
	}
	if (expected.hasSvgIcon === true) {
		expect(item?.icon).toContain('<svg');
	}
	if (expected.separatorAfter !== undefined) {
		expect(item?.separatorAfter).toBe(expected.separatorAfter);
	}
}

/**
 * Assert that a toolbar item's `isActive()` returns the expected value.
 *
 * @example
 * ```ts
 * const state = stateBuilder()
 *   .paragraph('bold', 'b1', { marks: [{ type: 'bold' }] })
 *   .cursor('b1', 2)
 *   .schema(['paragraph'], ['bold'])
 *   .build();
 * const h = await pluginHarness(new TextFormattingPlugin(), state);
 * expectToolbarActive(h, 'bold', true);
 * ```
 */
export function expectToolbarActive(
	harness: PluginHarnessResult,
	itemId: string,
	active: boolean,
	state?: EditorState,
): void {
	const item = harness.getToolbarItem(itemId);
	expect(item, `Toolbar item '${itemId}' should be registered`).toBeDefined();
	const testState: EditorState = state ?? harness.getState();
	expect(item?.isActive?.(testState)).toBe(active);
}

/**
 * Assert that a toolbar item's `isEnabled()` returns the expected value.
 */
export function expectToolbarEnabled(
	harness: PluginHarnessResult,
	itemId: string,
	enabled: boolean,
	state?: EditorState,
): void {
	const item = harness.getToolbarItem(itemId);
	expect(item, `Toolbar item '${itemId}' should be registered`).toBeDefined();
	const testState: EditorState = state ?? harness.getState();
	expect(item?.isEnabled?.(testState)).toBe(enabled);
}

/**
 * Assert that a combobox toolbar item's `getLabel()` returns the expected value.
 */
export function expectComboboxLabel(
	harness: PluginHarnessResult,
	itemId: string,
	expectedLabel: string,
	state?: EditorState,
): void {
	const item = harness.getToolbarItem(itemId);
	expect(item, `Toolbar item '${itemId}' should be registered`).toBeDefined();
	expect(item?.popupType, `Toolbar item '${itemId}' should be a combobox`).toBe('combobox');
	if (item?.popupType === 'combobox') {
		const testState: EditorState = state ?? harness.getState();
		expect(item.getLabel(testState)).toBe(expectedLabel);
	}
}

// ---------------------------------------------------------------------------
// Keymap assertions
// ---------------------------------------------------------------------------

/**
 * Assert that a key binding is registered.
 *
 * @example
 * ```ts
 * const h = await pluginHarness(new StrikethroughPlugin());
 * expectKeyBinding(h, 'Mod-Shift-X');
 * ```
 */
export function expectKeyBinding(harness: PluginHarnessResult, key: string): void {
	const keymaps = harness.getKeymaps();
	const found: boolean = keymaps.some((km) => km[key] !== undefined);
	expect(found, `Key binding '${key}' should be registered`).toBe(true);
}

/**
 * Assert that a key binding is NOT registered.
 */
export function expectNoKeyBinding(harness: PluginHarnessResult, key: string): void {
	const keymaps = harness.getKeymaps();
	const found: boolean = keymaps.some((km) => km[key] !== undefined);
	expect(found, `Key binding '${key}' should NOT be registered`).toBe(false);
}

// ---------------------------------------------------------------------------
// Command assertions
// ---------------------------------------------------------------------------

/**
 * Assert that a command is registered (returns true when executed).
 *
 * @example
 * ```ts
 * const h = await pluginHarness(new BlockquotePlugin());
 * expectCommandRegistered(h, 'toggleBlockquote');
 * ```
 */
export function expectCommandRegistered(harness: PluginHarnessResult, commandName: string): void {
	const result: boolean = harness.executeCommand(commandName);
	expect(result, `Command '${commandName}' should be registered`).toBe(true);
}

/**
 * Assert that a command is NOT registered (returns false when executed).
 */
export function expectCommandNotRegistered(
	harness: PluginHarnessResult,
	commandName: string,
): void {
	const result: boolean = harness.executeCommand(commandName);
	expect(result, `Command '${commandName}' should NOT be registered`).toBe(false);
}

/**
 * Assert that executing a command dispatches a transaction with steps.
 *
 * @example
 * ```ts
 * const h = await pluginHarness(new StrikethroughPlugin(), rangeState);
 * expectCommandDispatches(h, 'toggleStrikethrough');
 * ```
 */
export function expectCommandDispatches(harness: PluginHarnessResult, commandName: string): void {
	harness.dispatch.mockClear();
	harness.executeCommand(commandName);
	expect(harness.dispatch, `Command '${commandName}' should dispatch`).toHaveBeenCalled();
	const tr = harness.dispatch.mock.calls[0]?.[0];
	expect(tr.steps.length).toBeGreaterThan(0);
}
