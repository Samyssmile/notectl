/**
 * Schema-driven normalization for document trees.
 *
 * This belongs to the model layer because both external-content adapters and
 * input handlers need the same structural invariants. Keeping it here avoids
 * making lower-level input code depend on the editor Web Component layer.
 */

import {
	type BlockAttrs,
	type BlockNode,
	type ChildNode,
	type Document,
	blockAttrsEqual,
	createBlockNode,
	isInlineNode,
	isLeafBlock,
	isTextNode,
} from './Document.js';
import type { SchemaRegistry } from './SchemaRegistry.js';
import { nodeType } from './TypeBrands.js';

/**
 * Normalizes composite blocks so bare inline children are wrapped in paragraphs.
 * Composite blocks (those with a `content` rule, e.g. table_cell) must contain
 * block-level children. When JSON input provides inline children directly,
 * this wraps them in a paragraph to enforce schema consistency.
 */
export function normalizeCompositeBlocks(doc: Document, registry: SchemaRegistry): Document {
	const children: readonly BlockNode[] = doc.children.map((block) =>
		normalizeBlock(block, registry),
	);
	return { children };
}

/** Whether a content rule permits block-level children (beyond bare `text`). */
function allowsBlockChildren(content: { readonly allow: readonly string[] }): boolean {
	return content.allow.some((entry) => entry !== 'text');
}

function normalizeBlock(block: BlockNode, registry: SchemaRegistry): BlockNode {
	const spec = registry.getNodeSpec(block.type);
	let normalizedBlock: BlockNode = block;

	if (spec?.content && allowsBlockChildren(spec.content)) {
		const allowsInline: boolean = spec.content.allow.includes('text');

		if (isLeafBlock(block)) {
			// A hybrid block (list_item, #194) with inline children is already a valid
			// leaf. A composite with min: 0 may intentionally be empty (for example a
			// table row fully covered by rowspans); other pure composites get a paragraph.
			if (!allowsInline && !(block.children.length === 0 && spec.content.min === 0)) {
				const children: readonly ChildNode[] | undefined =
					block.children.length > 0 ? block.children : undefined;
				const paragraph: BlockNode = createBlockNode(nodeType('paragraph'), children);
				normalizedBlock = createBlockNode(
					block.type,
					[paragraph],
					block.id,
					block.attrs,
					block.htmlId,
				);
			}
		} else {
			// A container may arrive with bare inline runs around existing block children.
			// Turn each contiguous run into one paragraph while preserving every block's
			// position, then recurse so nested composites establish the same invariant.
			const normalized: readonly ChildNode[] = normalizeContainerChildren(block.children, registry);
			normalizedBlock = createBlockNode(
				block.type,
				normalized,
				block.id,
				block.attrs,
				block.htmlId,
			);
		}
	}

	const normalizedAttrs: BlockAttrs | undefined = spec?.normalizeAttrs?.(normalizedBlock);
	if (spec?.normalizeAttrs && !blockAttrsEqual(normalizedBlock.attrs, normalizedAttrs)) {
		const { attrs: _attrs, ...withoutAttrs } = normalizedBlock;
		normalizedBlock = {
			...withoutAttrs,
			...(normalizedAttrs ? { attrs: normalizedAttrs } : {}),
		};
	}
	return spec?.normalizeNode?.(normalizedBlock) ?? normalizedBlock;
}

function normalizeContainerChildren(
	children: readonly ChildNode[],
	registry: SchemaRegistry,
): readonly ChildNode[] {
	const normalized: ChildNode[] = [];
	let inlineRun: ChildNode[] = [];

	const flushInlineRun = (): void => {
		if (inlineRun.length === 0) return;
		normalized.push(createBlockNode(nodeType('paragraph'), inlineRun));
		inlineRun = [];
	};

	for (const child of children) {
		if (isTextNode(child) || isInlineNode(child)) {
			inlineRun.push(child);
			continue;
		}
		flushInlineRun();
		normalized.push(normalizeBlock(child, registry));
	}
	flushInlineRun();

	return normalized;
}
