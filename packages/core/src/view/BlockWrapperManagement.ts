/**
 * Block wrapper management: grouping consecutive blocks into shared
 * wrapper elements (e.g. `<ul>`, `<ol>` for list items).
 *
 * Provides both initial wrapping (`wrapBlocks`) and incremental
 * reconciliation (`reconcileWrappers`) that avoids unnecessary DOM
 * mutations when the wrapper structure is unchanged.
 *
 * No dependencies on other view modules — works purely with DOM and model types.
 */

import type { BlockNode } from '../model/Document.js';
import type { WrapperSpec } from '../model/NodeSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A group of consecutive blocks sharing a wrapper. */
interface WrapperGroup {
	readonly spec: WrapperSpec;
	readonly blockIds: BlockId[];
}

/** An entry in the top-level container sequence: either a wrapper or a bare block. */
interface WrapperEntry {
	readonly type: 'wrapper';
	readonly key: string;
	readonly blockIds: readonly BlockId[];
}

interface BareEntry {
	readonly type: 'bare';
	readonly blockId: BlockId;
}

type TopLevelEntry = WrapperEntry | BareEntry;

/** A wrapper entry read from the current DOM, including its element reference. */
interface DomWrapperEntry {
	readonly type: 'wrapper';
	readonly element: HTMLElement;
	readonly key: string;
	readonly blockIds: readonly BlockId[];
}

interface DomBareEntry {
	readonly type: 'bare';
	readonly element: HTMLElement;
	readonly blockId: BlockId;
}

type DomTopLevelEntry = DomWrapperEntry | DomBareEntry;

// ---------------------------------------------------------------------------
// Pure model computation
// ---------------------------------------------------------------------------

/** Computes wrapper groups from the block model. */
function computeWrapperGroups(
	blocks: readonly BlockNode[],
	registry: SchemaRegistry,
): readonly WrapperGroup[] {
	const groups: WrapperGroup[] = [];
	let currentSpec: WrapperSpec | null = null;
	let currentIds: BlockId[] = [];

	for (const block of blocks) {
		const nodeSpec = registry.getNodeSpec(block.type);
		const wSpec: WrapperSpec | undefined = nodeSpec?.wrapper?.(block as never);

		if (wSpec && currentSpec && wSpec.key === currentSpec.key) {
			currentIds.push(block.id);
		} else if (wSpec) {
			if (currentSpec && currentIds.length > 0) {
				groups.push({ spec: currentSpec, blockIds: currentIds });
			}
			currentSpec = wSpec;
			currentIds = [block.id];
		} else {
			if (currentSpec && currentIds.length > 0) {
				groups.push({ spec: currentSpec, blockIds: currentIds });
			}
			currentSpec = null;
			currentIds = [];
		}
	}
	if (currentSpec && currentIds.length > 0) {
		groups.push({ spec: currentSpec, blockIds: currentIds });
	}

	return groups;
}

/** Builds the desired top-level sequence from blocks and their wrapper groups. */
function computeDesiredSequence(
	blocks: readonly BlockNode[],
	groups: readonly WrapperGroup[],
): readonly TopLevelEntry[] {
	const sequence: TopLevelEntry[] = [];

	// Build a set of block IDs that belong to wrapper groups
	const wrappedIds = new Set<BlockId>();
	for (const group of groups) {
		for (const id of group.blockIds) {
			wrappedIds.add(id);
		}
	}

	let groupIdx = 0;
	for (const block of blocks) {
		if (!wrappedIds.has(block.id)) {
			sequence.push({ type: 'bare', blockId: block.id });
			continue;
		}

		// Check if this block starts a wrapper group
		const group: WrapperGroup | undefined = groups[groupIdx];
		if (group && group.blockIds[0] === block.id) {
			sequence.push({
				type: 'wrapper',
				key: group.spec.key,
				blockIds: group.blockIds,
			});
			groupIdx++;
		}
		// Otherwise, this block is part of the current group (already emitted)
	}

	return sequence;
}

// ---------------------------------------------------------------------------
// DOM reading
// ---------------------------------------------------------------------------

/** Reads the current top-level structure from the DOM. */
function readDomSequence(container: HTMLElement): readonly DomTopLevelEntry[] {
	const sequence: DomTopLevelEntry[] = [];

	for (const child of Array.from(container.children)) {
		if (!(child instanceof HTMLElement)) continue;

		if (child.hasAttribute('data-block-wrapper')) {
			const key: string = child.getAttribute('data-block-wrapper') ?? '';
			const blockIds: BlockId[] = [];
			for (const inner of Array.from(child.children)) {
				if (!(inner instanceof HTMLElement)) continue;
				const bid: string | null = inner.getAttribute('data-block-id');
				if (bid) blockIds.push(toBlockId(bid));
			}
			sequence.push({ type: 'wrapper', element: child, key, blockIds });
		} else if (child.hasAttribute('data-block-id')) {
			const bid: string = child.getAttribute('data-block-id') ?? '';
			sequence.push({ type: 'bare', element: child, blockId: toBlockId(bid) });
		}
	}

	return sequence;
}

// ---------------------------------------------------------------------------
// Fast-path comparison
// ---------------------------------------------------------------------------

/** Returns true when the desired and actual sequences are structurally identical. */
function sequencesMatch(
	desired: readonly TopLevelEntry[],
	actual: readonly DomTopLevelEntry[],
): boolean {
	if (desired.length !== actual.length) return false;

	for (let i = 0; i < desired.length; i++) {
		const d: TopLevelEntry | undefined = desired[i];
		const a: DomTopLevelEntry | undefined = actual[i];
		if (!d || !a) return false;

		if (d.type !== a.type) return false;

		if (d.type === 'bare' && a.type === 'bare') {
			if (d.blockId !== a.blockId) return false;
		} else if (d.type === 'wrapper' && a.type === 'wrapper') {
			if (d.key !== a.key) return false;
			if (d.blockIds.length !== a.blockIds.length) return false;
			for (let j = 0; j < d.blockIds.length; j++) {
				if (d.blockIds[j] !== a.blockIds[j]) return false;
			}
		}
	}

	return true;
}

// ---------------------------------------------------------------------------
// Wrapper attribute sync
// ---------------------------------------------------------------------------

/** Syncs wrapper element attributes to match the spec, only touching what differs. */
function syncWrapperAttributes(element: HTMLElement, spec: WrapperSpec): void {
	if (spec.className && element.className !== spec.className) {
		element.className = spec.className;
	}
	if (spec.attrs) {
		for (const [key, value] of Object.entries(spec.attrs)) {
			if (element.getAttribute(key) !== value) {
				element.setAttribute(key, value);
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Full reconciliation helpers
// ---------------------------------------------------------------------------

/** Creates a new wrapper DOM element from a WrapperSpec. */
function createWrapperElement(spec: WrapperSpec): HTMLElement {
	const wrapper: HTMLElement = document.createElement(spec.tag);
	wrapper.setAttribute('data-block-wrapper', spec.key);
	if (spec.className) {
		wrapper.className = spec.className;
	}
	if (spec.attrs) {
		for (const [key, value] of Object.entries(spec.attrs)) {
			wrapper.setAttribute(key, value);
		}
	}
	return wrapper;
}

/**
 * Ensures a node appears immediately after `previousNode` among the
 * direct children of `container`. No-op if already in the correct position.
 */
function ensureCorrectPosition(
	container: HTMLElement,
	node: HTMLElement,
	previousNode: HTMLElement | null,
): void {
	const expectedNext: ChildNode | null = previousNode
		? previousNode.nextSibling
		: container.firstChild;

	if (node === expectedNext) return;
	// Node is the first child needed and previousNode is null
	if (!previousNode && node.parentNode === container && node === container.firstChild) return;

	if (previousNode) {
		previousNode.after(node);
	} else {
		container.insertBefore(node, container.firstChild);
	}
}

/**
 * Ensures exactly the specified blocks are inside the wrapper in order.
 * Moves blocks in from other parents as needed.
 */
function reconcileWrapperContents(
	wrapper: HTMLElement,
	desiredBlockIds: readonly BlockId[],
	container: HTMLElement,
): void {
	for (let i = 0; i < desiredBlockIds.length; i++) {
		const bid: BlockId | undefined = desiredBlockIds[i];
		if (!bid) continue;

		const expected: HTMLElement | null = container.querySelector(`[data-block-id="${bid}"]`);
		if (!expected) continue;

		const currentChild: Element | null = wrapper.children[i] ?? null;
		if (expected === currentChild) continue;

		// Insert at the correct position
		if (currentChild) {
			wrapper.insertBefore(expected, currentChild);
		} else {
			wrapper.appendChild(expected);
		}
	}

	// Remove any extra children that shouldn't be in this wrapper
	const desiredSet = new Set<string>(desiredBlockIds);
	for (const child of Array.from(wrapper.children)) {
		const bid: string | null = child.getAttribute('data-block-id');
		if (bid && !desiredSet.has(bid)) {
			container.insertBefore(child, wrapper);
		}
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconciles wrapper elements in the container to match the desired structure
 * derived from the block model. Uses a fast-path comparison to avoid any DOM
 * mutations when the wrapper structure is unchanged (e.g. selection-only updates).
 */
export function reconcileWrappers(
	container: HTMLElement,
	blocks: readonly BlockNode[],
	registry: SchemaRegistry,
): void {
	const groups: readonly WrapperGroup[] = computeWrapperGroups(blocks, registry);
	const desired: readonly TopLevelEntry[] = computeDesiredSequence(blocks, groups);
	const actual: readonly DomTopLevelEntry[] = readDomSequence(container);

	// Fast-path: structure unchanged → sync attrs only, zero structural DOM mutations
	if (sequencesMatch(desired, actual)) {
		let groupIdx = 0;
		for (const entry of actual) {
			if (entry.type === 'wrapper') {
				const group: WrapperGroup | undefined = groups[groupIdx];
				if (group) syncWrapperAttributes(entry.element, group.spec);
				groupIdx++;
			}
		}
		return;
	}

	// Full reconciliation: diff and patch
	// Build a pool of reusable wrappers keyed by wrapper key
	const wrapperPool = new Map<string, HTMLElement[]>();
	for (const entry of actual) {
		if (entry.type !== 'wrapper') continue;
		let pool: HTMLElement[] | undefined = wrapperPool.get(entry.key);
		if (!pool) {
			pool = [];
			wrapperPool.set(entry.key, pool);
		}
		pool.push(entry.element);
	}

	const usedWrappers = new Set<HTMLElement>();
	let previousTopLevel: HTMLElement | null = null;
	let groupIdx = 0;

	for (const entry of desired) {
		if (entry.type === 'bare') {
			const blockEl: HTMLElement | null = container.querySelector(
				`[data-block-id="${entry.blockId}"]`,
			);
			if (!blockEl) continue;

			// Ensure block is a direct child of container at the right position
			if (blockEl.parentNode !== container) {
				// Move out of wrapper
				if (previousTopLevel) {
					previousTopLevel.after(blockEl);
				} else {
					container.insertBefore(blockEl, container.firstChild);
				}
			} else {
				ensureCorrectPosition(container, blockEl, previousTopLevel);
			}
			previousTopLevel = blockEl;
			continue;
		}

		// entry.type === 'wrapper'
		const group: WrapperGroup | undefined = groups[groupIdx];
		if (!group) continue;
		groupIdx++;

		// Try to reuse an existing wrapper with matching key
		const pool: HTMLElement[] | undefined = wrapperPool.get(entry.key);
		let wrapperEl: HTMLElement | null = null;

		if (pool && pool.length > 0) {
			const candidate: HTMLElement | undefined = pool.shift();
			if (candidate) {
				// Check if tag matches — can't change tagName of existing element
				if (candidate.tagName.toLowerCase() === group.spec.tag) {
					wrapperEl = candidate;
				} else {
					// Tag mismatch — create new, remove old later
					wrapperEl = createWrapperElement(group.spec);
				}
			}
		}

		if (!wrapperEl) {
			wrapperEl = createWrapperElement(group.spec);
		}

		usedWrappers.add(wrapperEl);
		syncWrapperAttributes(wrapperEl, group.spec);

		// Ensure wrapper is at the correct position in container
		if (wrapperEl.parentNode !== container) {
			if (previousTopLevel) {
				previousTopLevel.after(wrapperEl);
			} else {
				container.insertBefore(wrapperEl, container.firstChild);
			}
		} else {
			ensureCorrectPosition(container, wrapperEl, previousTopLevel);
		}

		// Ensure correct blocks are inside the wrapper
		reconcileWrapperContents(wrapperEl, entry.blockIds, container);

		previousTopLevel = wrapperEl;
	}

	// Remove unused wrappers
	for (const entry of actual) {
		if (entry.type !== 'wrapper') continue;
		if (usedWrappers.has(entry.element)) continue;

		// Move any remaining children out
		while (entry.element.firstChild) {
			container.insertBefore(entry.element.firstChild, entry.element);
		}
		entry.element.remove();
	}
}

/**
 * Groups consecutive blocks that declare the same wrapper key into shared
 * wrapper elements (`<ul>`, `<ol>`, etc.). Used for initial rendering of
 * nested container children (e.g. list items inside table cells).
 */
export function wrapBlocks(
	container: HTMLElement,
	blocks: readonly BlockNode[],
	registry?: SchemaRegistry,
): void {
	if (!registry) return;

	const groups: readonly WrapperGroup[] = computeWrapperGroups(blocks, registry);

	for (const group of groups) {
		const firstEl: HTMLElement | null = container.querySelector(
			`[data-block-id="${group.blockIds[0]}"]`,
		);
		if (!firstEl) continue;

		const wrapper: HTMLElement = createWrapperElement(group.spec);

		firstEl.before(wrapper);
		for (const bid of group.blockIds) {
			const el: HTMLElement | null = container.querySelector(`[data-block-id="${bid}"]`);
			if (el) {
				wrapper.appendChild(el);
			}
		}
	}
}

/**
 * Returns rendered top-level block elements in visual order.
 * Includes direct children and immediate children of block wrappers.
 */
export function getRenderedBlockElements(container: HTMLElement): readonly HTMLElement[] {
	const blocks: HTMLElement[] = [];
	for (const child of Array.from(container.children)) {
		if (!(child instanceof HTMLElement)) continue;
		if (child.hasAttribute('data-block-id')) {
			blocks.push(child);
			continue;
		}
		if (!child.hasAttribute('data-block-wrapper')) continue;

		for (const wrappedChild of Array.from(child.children)) {
			if (!(wrappedChild instanceof HTMLElement)) continue;
			if (wrappedChild.hasAttribute('data-block-id')) {
				blocks.push(wrappedChild);
			}
		}
	}
	return blocks;
}

/** Removes a rendered block from whichever parent currently owns it. */
export function removeBlockElement(el: HTMLElement): void {
	el.parentElement?.removeChild(el);
}

/** Replaces a rendered block in-place, honoring wrapper parents when present. */
export function replaceBlockElement(
	oldEl: HTMLElement,
	newEl: HTMLElement,
	container: HTMLElement,
): void {
	const parent: HTMLElement | null = oldEl.parentElement;
	if (parent) {
		parent.replaceChild(newEl, oldEl);
		return;
	}
	container.replaceChild(newEl, oldEl);
}

/**
 * Inserts a new rendered block after the given sibling.
 * If the sibling is inside a wrapper, insertion happens inside that wrapper.
 */
export function insertAfterPreviousSibling(
	container: HTMLElement,
	previousSibling: Element | null,
	newEl: HTMLElement,
): void {
	if (previousSibling?.parentElement) {
		const parent: HTMLElement = previousSibling.parentElement;
		if (previousSibling.nextSibling) {
			parent.insertBefore(newEl, previousSibling.nextSibling);
		} else {
			parent.appendChild(newEl);
		}
		return;
	}

	if (container.firstChild) {
		container.insertBefore(newEl, container.firstChild);
	} else {
		container.appendChild(newEl);
	}
}
