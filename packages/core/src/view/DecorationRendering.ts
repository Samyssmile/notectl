/**
 * Decoration rendering: inline, node, and widget decorations.
 *
 * Handles splitting text content by decoration/widget boundaries, stable keyed
 * widget DOM, and reversible node-decoration presentation ownership.
 */

import type {
	DecorationAttrs,
	InlineDecoration,
	NodeDecoration,
	WidgetDecoration,
} from '../decorations/Decoration.js';
import { decorationArraysEqual, getWidgetCallbackOwner } from '../decorations/Decoration.js';
import type { InlineNode, TextNode } from '../model/Document.js';
import { isInlineNode } from '../model/Document.js';
import { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';
import { getStyleText, setStyleText } from '../style/StyleRuntime.js';
import { preserveSpaces, renderInlineNode } from './InlineRendering.js';
import { wrapNodeWithMarks } from './MarkRendering.js';
import type { ReconcileOptions } from './Reconciler.js';

interface AppliedNodeDecorations {
	readonly decorations: readonly NodeDecoration[];
	readonly managed: ReadonlySet<string>;
	readonly preexisting: ReadonlySet<string>;
	readonly previousStyles: ReadonlyMap<string, string | null>;
}

const appliedNodeDecorations: WeakMap<HTMLElement, AppliedNodeDecorations> = new WeakMap();

/** Keyed widget DOM retained for reuse while a reconciliation replaces its owning block DOM. */
export type WidgetDOMPool = Map<BlockId, Map<string, HTMLElement[]>>;

/** Collects all keyed widget elements currently mounted below a reconciliation root. */
export function collectWidgetDOMPool(container: HTMLElement): WidgetDOMPool {
	const pool: WidgetDOMPool = new Map();
	for (const element of container.querySelectorAll<HTMLElement>(
		'[data-decoration-widget][data-widget-key][data-widget-block-id]',
	)) {
		const rawBlockId: string | null = element.getAttribute('data-widget-block-id');
		const key: string | null = element.getAttribute('data-widget-key');
		if (rawBlockId === null || key === null) continue;
		const bid = toBlockId(rawBlockId);
		const byKey: Map<string, HTMLElement[]> = pool.get(bid) ?? new Map();
		const elements: HTMLElement[] = byKey.get(key) ?? [];
		elements.push(element);
		byKey.set(key, elements);
		pool.set(bid, byKey);
	}
	return pool;
}

/**
 * Renders inline content with inline and widget decorations. InlineNodes are
 * width-1 split points rendered as their own elements (not wrapped by decorations).
 *
 * For each child:
 * - TextNode: split by decoration boundaries, render text → marks → decorations
 * - InlineNode: render directly without decoration wrapping
 */
export function renderDecoratedContent(
	container: HTMLElement,
	inlineChildren: readonly (TextNode | InlineNode)[],
	inlineDecos: readonly InlineDecoration[],
	registry?: SchemaRegistry,
	widgetDecos: readonly WidgetDecoration[] = [],
	widgetContext?: {
		readonly blockId: BlockId;
		readonly pool?: WidgetDOMPool;
		readonly callbackExecutor?: PluginCallbackExecutor;
	},
): void {
	const totalLength: number = inlineChildren.reduce(
		(length, child) => length + (isInlineNode(child) ? 1 : child.text.length),
		0,
	);
	const widgetsByOffset: ReadonlyMap<number, readonly WidgetDecoration[]> = groupWidgetsByOffset(
		widgetDecos,
		totalLength,
	);
	// A reconciliation-scoped pool already owns every mounted keyed widget below
	// the editor root. Do not index the same DOM nodes a second time through the
	// local container cache: duplicate keys could otherwise take one element from
	// each cache and append that same node twice. Standalone content renders have
	// no pool and retain the local reuse path.
	const reusableWidgets: Map<string, HTMLElement[]> = widgetContext?.pool
		? new Map()
		: collectReusableWidgets(container);
	container.replaceChildren();

	const emitWidgets = (offset: number): void => {
		const widgets: readonly WidgetDecoration[] | undefined = widgetsByOffset.get(offset);
		if (!widgets) return;
		for (const decoration of widgets) {
			container.appendChild(renderWidget(decoration, offset, reusableWidgets, widgetContext));
		}
	};

	// Empty blocks still need their position-zero widgets before the caret placeholder.
	if (
		inlineChildren.length === 1 &&
		!isInlineNode(inlineChildren[0]) &&
		inlineChildren[0]?.text === ''
	) {
		emitWidgets(0);
		container.appendChild(document.createElement('br'));
		return;
	}

	let globalOffset = 0;

	for (const child of inlineChildren) {
		if (isInlineNode(child)) {
			emitWidgets(globalOffset);
			// InlineNodes are rendered directly (not wrapped by decorations), but their
			// own marks (e.g. a link on an inline image) still wrap the node.
			container.appendChild(
				wrapNodeWithMarks(renderInlineNode(child, registry), child.marks, registry),
			);
			globalOffset += 1;
			continue;
		}

		// TextNode: split by decoration boundaries within this node's range
		const textFrom: number = globalOffset;
		const textTo: number = globalOffset + child.text.length;

		if (child.text.length === 0) {
			globalOffset = textTo;
			continue;
		}

		// Find split points within this text range
		const splitSet = new Set<number>();
		splitSet.add(textFrom);
		splitSet.add(textTo);
		for (const deco of inlineDecos) {
			const dFrom: number = Math.max(textFrom, deco.from);
			const dTo: number = Math.min(textTo, deco.to);
			if (dFrom > textFrom && dFrom < textTo) splitSet.add(dFrom);
			if (dTo > textFrom && dTo < textTo) splitSet.add(dTo);
		}
		for (const offset of widgetsByOffset.keys()) {
			if (offset > textFrom && offset < textTo) splitSet.add(offset);
		}
		const splits: number[] = [...splitSet].sort((a, b) => a - b);

		// Render micro-segments
		for (let i = 0; i < splits.length - 1; i++) {
			const from: number | undefined = splits[i];
			const to: number | undefined = splits[i + 1];
			if (from === undefined || to === undefined || from >= to) continue;
			emitWidgets(from);

			const localFrom: number = from - textFrom;
			const localTo: number = to - textFrom;
			const text: string = child.text.slice(localFrom, localTo);

			// Find decorations that fully cover this micro-segment
			const activeDecos: InlineDecoration[] = [];
			for (const deco of inlineDecos) {
				if (deco.from <= from && deco.to >= to) {
					activeDecos.push(deco);
				}
			}

			// Render: text → marks (inner) → decorations (outer)
			const textNode: Text = document.createTextNode(preserveSpaces(text));
			let current: Node = wrapNodeWithMarks(textNode, child.marks, registry);

			// Wrap with decorations (outermost)
			for (const deco of activeDecos) {
				const el: HTMLElement = createDecorationElement(deco.attrs);
				el.appendChild(current);
				current = el;
			}

			container.appendChild(current);
		}

		globalOffset = textTo;
	}

	emitWidgets(totalLength);

	// Trailing <br> hack: when the last child is a hard_break InlineNode,
	// browsers won't render an empty line after a trailing <br>.
	const lastChild: TextNode | InlineNode | undefined = inlineChildren[inlineChildren.length - 1];
	if (lastChild && isInlineNode(lastChild) && lastChild.inlineType === 'hard_break') {
		container.appendChild(document.createElement('br'));
	}
}

/** Groups widgets by their clamped document offset and applies deterministic side ordering. */
function groupWidgetsByOffset(
	widgets: readonly WidgetDecoration[],
	totalLength: number,
): ReadonlyMap<number, readonly WidgetDecoration[]> {
	const grouped = new Map<
		number,
		Array<{ readonly decoration: WidgetDecoration; readonly index: number }>
	>();
	for (let index = 0; index < widgets.length; index++) {
		const decoration: WidgetDecoration | undefined = widgets[index];
		if (!decoration) continue;
		const finiteOffset: number = Number.isFinite(decoration.offset) ? decoration.offset : 0;
		const offset: number = Math.max(0, Math.min(totalLength, Math.trunc(finiteOffset)));
		const existing = grouped.get(offset) ?? [];
		existing.push({ decoration, index });
		grouped.set(offset, existing);
	}

	const result = new Map<number, readonly WidgetDecoration[]>();
	for (const [offset, entries] of grouped) {
		entries.sort((a, b) => a.decoration.side - b.decoration.side || a.index - b.index);
		result.set(
			offset,
			entries.map((entry) => entry.decoration),
		);
	}
	return result;
}

/** Collects keyed widget DOM before content replacement so stable widgets can be moved and reused. */
function collectReusableWidgets(container: HTMLElement): Map<string, HTMLElement[]> {
	const reusable = new Map<string, HTMLElement[]>();
	for (const child of Array.from(container.children)) {
		if (!(child instanceof HTMLElement) || !child.hasAttribute('data-decoration-widget')) continue;
		const key: string | null = child.getAttribute('data-widget-key');
		if (key === null) continue;
		const elements: HTMLElement[] = reusable.get(key) ?? [];
		elements.push(child);
		reusable.set(key, elements);
	}
	return reusable;
}

/** Creates or reuses the DOM owned by a widget decoration. */
function renderWidget(
	decoration: WidgetDecoration,
	offset: number,
	reusable: Map<string, HTMLElement[]>,
	context?: {
		readonly blockId: BlockId;
		readonly pool?: WidgetDOMPool;
		readonly callbackExecutor?: PluginCallbackExecutor;
	},
): HTMLElement {
	let element: HTMLElement | undefined;
	if (decoration.key !== undefined) {
		element = takePooledWidget(context?.pool, context?.blockId, decoration.key);
		if (!element) {
			const candidates: HTMLElement[] | undefined = reusable.get(decoration.key);
			element = candidates?.shift();
			if (candidates?.length === 0) reusable.delete(decoration.key);
		}
	}
	element ??= renderWidgetDOM(decoration, context?.callbackExecutor);
	element.setAttribute('data-widget', 'true');
	element.setAttribute('data-decoration-widget', 'true');
	element.setAttribute('data-widget-offset', String(offset));
	element.setAttribute('data-widget-side', String(decoration.side));
	element.setAttribute('contenteditable', 'false');
	if (decoration.key === undefined) {
		element.removeAttribute('data-widget-key');
	} else {
		element.setAttribute('data-widget-key', decoration.key);
	}
	if (context) element.setAttribute('data-widget-block-id', context.blockId);
	return element;
}

function renderWidgetDOM(
	decoration: WidgetDecoration,
	executor: PluginCallbackExecutor = PluginCallbackExecutor.silent,
): HTMLElement {
	const owner = getWidgetCallbackOwner(decoration) ?? {
		pluginId: 'unattributed',
		name: 'widget',
	};
	const outcome = executor.execute(
		{ pluginId: owner.pluginId, name: `${owner.name}:toDOM`, kind: 'widget-render' },
		() => {
			const element = decoration.toDOM();
			if (!(element instanceof HTMLElement)) {
				throw new TypeError('WidgetDecoration.toDOM must return an HTMLElement.');
			}
			return element;
		},
	);
	if (outcome.ok) return outcome.value;
	const fallback = document.createElement('span');
	fallback.setAttribute('data-widget-render-fallback', 'true');
	return fallback;
}

/** Takes one keyed widget from a reconciliation-scoped pool. */
function takePooledWidget(
	pool: WidgetDOMPool | undefined,
	blockId: BlockId | undefined,
	key: string,
): HTMLElement | undefined {
	if (!pool || blockId === undefined) return undefined;
	const byKey: Map<string, HTMLElement[]> | undefined = pool.get(blockId);
	const elements: HTMLElement[] | undefined = byKey?.get(key);
	const element: HTMLElement | undefined = elements?.shift();
	if (elements?.length === 0) byKey?.delete(key);
	if (byKey?.size === 0) pool.delete(blockId);
	return element;
}

/** Creates a DOM element for an inline decoration. */
function createDecorationElement(attrs: DecorationAttrs): HTMLElement {
	const tagName: string = attrs.nodeName ?? 'span';
	const el: HTMLElement = document.createElement(tagName);
	el.setAttribute('data-decoration', 'true');

	if (attrs.class) {
		for (const cls of attrs.class.split(' ')) {
			if (cls) el.classList.add(cls);
		}
	}
	if (attrs.style) {
		setStyleText(el, attrs.style);
	}

	// Apply any other custom attributes
	for (const [key, value] of Object.entries(attrs)) {
		if (key === 'class' || key === 'style' || key === 'nodeName') continue;
		if (value !== undefined) {
			el.setAttribute(key, value);
		}
	}

	return el;
}

/** Applies node decorations (CSS classes/styles) to a block element. */
export function applyNodeDecorations(
	el: HTMLElement,
	bid: BlockId,
	options?: ReconcileOptions,
): void {
	syncNodeDecorations(el, bid, options);
}

/**
 * Synchronizes node decorations without replacing a NodeView. Decoration-owned
 * classes and style properties are restored to their pre-decoration values when
 * they change or disappear, so renderer- and NodeView-owned presentation survives.
 */
export function syncNodeDecorations(
	el: HTMLElement,
	bid: BlockId,
	options?: ReconcileOptions,
): void {
	const desiredDecorations: readonly NodeDecoration[] = options?.decorations?.findNode(bid) ?? [];
	const previous: AppliedNodeDecorations | undefined = appliedNodeDecorations.get(el);
	if (previous && decorationArraysEqual(previous.decorations, desiredDecorations)) return;
	restoreNodeDecorations(el, previous);

	const desired = new Set<string>();
	const desiredStyles = new Map<string, string>();
	for (const decoration of desiredDecorations) {
		for (const className of decoration.attrs.class?.split(/\s+/) ?? []) {
			if (className) desired.add(className);
		}
		for (const [property, value] of parseStyleText(decoration.attrs.style ?? '')) {
			desiredStyles.set(property, value);
		}
	}
	if (desired.size === 0 && desiredStyles.size === 0) {
		appliedNodeDecorations.delete(el);
		return;
	}

	const preexisting = new Set<string>();
	for (const className of desired) {
		if (el.classList.contains(className)) preexisting.add(className);
		else el.classList.add(className);
	}

	const currentStyles: Map<string, string> = parseStyleText(getStyleText(el));
	const previousStyles = new Map<string, string | null>();
	for (const [property, value] of desiredStyles) {
		previousStyles.set(property, currentStyles.get(property) ?? null);
		currentStyles.set(property, value);
	}
	if (desiredStyles.size > 0) setStyleText(el, serializeStyleText(currentStyles));

	appliedNodeDecorations.set(el, {
		decorations: [...desiredDecorations],
		managed: desired,
		preexisting,
		previousStyles,
	});
}

/** Restores any presentation currently owned by node decorations. */
export function clearNodeDecorations(el: HTMLElement): void {
	const previous: AppliedNodeDecorations | undefined = appliedNodeDecorations.get(el);
	restoreNodeDecorations(el, previous);
	appliedNodeDecorations.delete(el);
}

function restoreNodeDecorations(
	el: HTMLElement,
	previous: AppliedNodeDecorations | undefined,
): void {
	if (!previous) return;
	for (const className of previous.managed) {
		if (!previous.preexisting.has(className)) el.classList.remove(className);
	}
	if (previous.previousStyles.size === 0) return;

	const currentStyles: Map<string, string> = parseStyleText(getStyleText(el));
	for (const [property, value] of previous.previousStyles) {
		if (value === null) currentStyles.delete(property);
		else currentStyles.set(property, value);
	}
	setStyleText(el, serializeStyleText(currentStyles));
}

function parseStyleText(styleText: string): Map<string, string> {
	const declarations = new Map<string, string>();
	for (const rawPart of styleText.split(';')) {
		const part: string = rawPart.trim();
		if (!part) continue;
		const separator: number = part.indexOf(':');
		if (separator <= 0) continue;
		const property: string = normalizeStyleProperty(part.slice(0, separator));
		const value: string = part.slice(separator + 1).trim();
		if (property && value) declarations.set(property, value);
	}
	return declarations;
}

function normalizeStyleProperty(property: string): string {
	const trimmed: string = property.trim();
	if (trimmed.startsWith('--')) return trimmed;
	if (trimmed.includes('-')) return trimmed.toLowerCase();
	return trimmed.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`).toLowerCase();
}

function serializeStyleText(declarations: ReadonlyMap<string, string>): string {
	return [...declarations.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([property, value]) => `${property}: ${value}`)
		.join('; ');
}
