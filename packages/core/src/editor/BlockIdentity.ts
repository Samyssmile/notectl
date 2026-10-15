/**
 * Block identity for content formats that carry no block ID, such as plain
 * text and Markdown.
 *
 * `setX(getX())` must keep the IDs of unchanged blocks (ARCHITECTURE §9.2):
 * the caret-preserving `replaceState()` can only keep a caret whose block ID
 * still exists. Without an ID in the content, identity follows position, at
 * every depth, so a caret inside a quote, list item or table cell stays put.
 */

import type { BlockNode, ChildNode, Document } from '../model/Document.js';
import { generateBlockId, getBlockChildren, isBlockNode } from '../model/Document.js';
import type { BlockId } from '../model/TypeBrands.js';

/**
 * Returns `next` with the block IDs of `current` carried over by path.
 *
 * Each block takes the ID of the block at the same path in `current`, where a
 * path counts block children only, so inline content never shifts it. Types
 * are not compared, as identity is best-effort by position. A block without
 * such a counterpart keeps its own ID unless a reused ID or an earlier block
 * holds it, in which case it gets a fresh one. The result therefore never
 * holds an ID twice, and nothing but block IDs changes.
 *
 * @param next - The document that replaces `current`, e.g. one just parsed.
 * @param current - The document whose block IDs are reused.
 */
export function reuseBlockIdsByPath(next: Document, current: Document): Document {
	const reused: Set<BlockId> = new Set();
	collectReusedIds(next.children, current.children, reused);
	const ids: BlockIdAllocator = new BlockIdAllocator(reused);
	return {
		...next,
		children: next.children.map((block, index) =>
			assignBlockIds(block, current.children[index], ids),
		),
	};
}

/** Collects the ID of every block in `current` whose path also exists in `next`. */
function collectReusedIds(
	next: readonly BlockNode[],
	current: readonly BlockNode[],
	reused: Set<BlockId>,
): void {
	next.forEach((block, index) => {
		const counterpart: BlockNode | undefined = current[index];
		if (!counterpart) return;
		reused.add(counterpart.id);
		collectReusedIds(getBlockChildren(block), getBlockChildren(counterpart), reused);
	});
}

/** Assigns IDs to `block` and its descendants in document order, parents first. */
function assignBlockIds(
	block: BlockNode,
	counterpart: BlockNode | undefined,
	ids: BlockIdAllocator,
): BlockNode {
	const id: BlockId = ids.claim(counterpart?.id, block.id);
	const counterparts: readonly BlockNode[] = counterpart ? getBlockChildren(counterpart) : [];
	let blockIndex = 0;
	const children: readonly ChildNode[] = block.children.map((child) => {
		if (!isBlockNode(child)) return child;
		const assigned: BlockNode = assignBlockIds(child, counterparts[blockIndex], ids);
		blockIndex++;
		return assigned;
	});
	return { ...block, id, children };
}

/** Hands out unique block IDs, giving reused IDs precedence over a block's own ID. */
class BlockIdAllocator {
	private readonly taken: Set<BlockId> = new Set();

	constructor(private readonly reused: ReadonlySet<BlockId>) {}

	/** The reused ID while free, else the own ID unless reused or taken, else a fresh ID. */
	claim(reusedId: BlockId | undefined, ownId: BlockId): BlockId {
		if (reusedId !== undefined && !this.taken.has(reusedId)) return this.take(reusedId);
		if (!this.reused.has(ownId) && !this.taken.has(ownId)) return this.take(ownId);
		return this.take(this.freshId());
	}

	private freshId(): BlockId {
		let id: BlockId = generateBlockId();
		while (this.reused.has(id) || this.taken.has(id)) id = generateBlockId();
		return id;
	}

	private take(id: BlockId): BlockId {
		this.taken.add(id);
		return id;
	}
}
