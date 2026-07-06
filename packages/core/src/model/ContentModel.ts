/**
 * Content model validation for nested document structures.
 * Validates whether a parent node type can contain given child types.
 */

import type { BlockNode, ChildNode, Document } from './Document.js';
import {
	createBlockNode,
	createTextNode,
	getInlineChildren,
	isBlockNode,
	isLeafBlock,
} from './Document.js';
import type { SchemaRegistry } from './SchemaRegistry.js';
import { nodeType } from './TypeBrands.js';

/**
 * Checks if a parent node type can contain a child node type,
 * using the content rules and group system from NodeSpec.
 */
export function canContain(
	registry: SchemaRegistry,
	parentType: string,
	childType: string,
): boolean {
	const parentSpec = registry.getNodeSpec(parentType);
	if (!parentSpec?.content) return true; // No content rule = anything allowed

	const childSpec = registry.getNodeSpec(childType);
	const childGroup = childSpec?.group;

	for (const allowed of parentSpec.content.allow) {
		if (allowed === childType) return true;
		if (allowed === 'text') continue; // 'text' refers to TextNodes, not BlockNodes
		if (childGroup && allowed === childGroup) return true;
	}

	return false;
}

/**
 * Validates whether the given children types are valid for a parent node type.
 * Checks allow list, min/max constraints.
 */
export function validateContent(
	registry: SchemaRegistry,
	parentType: string,
	childTypes: readonly string[],
): boolean {
	const parentSpec = registry.getNodeSpec(parentType);
	if (!parentSpec?.content) return true;

	const { min = 0, max = Number.POSITIVE_INFINITY } = parentSpec.content;

	// Check count constraints (only for block children, not text)
	const blockChildTypes = childTypes.filter((t) => t !== 'text');
	if (blockChildTypes.length < min || blockChildTypes.length > max) return false;

	// Check each child is allowed
	for (const childType of blockChildTypes) {
		if (!canContain(registry, parentType, childType)) return false;
	}

	return true;
}

/**
 * Repairs a parsed document so no container holds a block its content rule
 * forbids. A disallowed block (e.g. a `table` a Markdown/HTML importer nested
 * under a `list_item`, whose flat-with-indent model cannot hold it, #194)
 * bubbles up to the nearest ancestor that allows it, and to the document root
 * otherwise — the root imposes no content rule, so relocation is always
 * lossless. Order is preserved: a hoisted block lands immediately after the
 * subtree it escaped from. Runs only with a registry; identity is preserved when
 * nothing moves so callers can skip needless work.
 */
export function hoistDisallowedBlocks(doc: Document, registry: SchemaRegistry): Document {
	const children: BlockNode[] = [];
	let changed = false;
	for (const block of doc.children) {
		const { node, hoisted } = repairContainer(block, registry);
		if (node !== block || hoisted.length > 0) changed = true;
		children.push(node, ...hoisted);
	}
	return changed ? { children } : doc;
}

/**
 * Repairs one block's subtree, returning the repaired node and any descendant
 * blocks that could not be placed within it (to be hoisted by the caller).
 */
function repairContainer(
	block: BlockNode,
	registry: SchemaRegistry,
): { readonly node: BlockNode; readonly hoisted: readonly BlockNode[] } {
	if (isLeafBlock(block)) return { node: block, hoisted: [] };

	const kept: ChildNode[] = [];
	const hoisted: BlockNode[] = [];
	let changed = false;

	const place = (candidate: BlockNode): void => {
		if (canContain(registry, block.type, candidate.type)) {
			kept.push(candidate);
		} else {
			hoisted.push(candidate);
			changed = true;
		}
	};

	for (const child of block.children) {
		if (!isBlockNode(child)) {
			kept.push(child);
			continue;
		}
		const repaired = repairContainer(child, registry);
		if (repaired.node !== child) changed = true;
		place(repaired.node);
		for (const bubbled of repaired.hoisted) place(bubbled);
	}

	if (!changed) return { node: block, hoisted: [] };

	const finalChildren: readonly ChildNode[] = resolveRepairedChildren(block, kept, registry);
	return {
		node: createBlockNode(block.type, finalChildren, block.id, block.attrs),
		hoisted,
	};
}

/**
 * Settles a repaired container's children: an emptied container gets a valid
 * placeholder, and a hybrid (leaf-capable) container reduced to a single plain
 * paragraph collapses back to the canonical leaf shape — mirroring how the
 * importers keep a lone single-paragraph item a leaf (#194).
 */
function resolveRepairedChildren(
	block: BlockNode,
	kept: readonly ChildNode[],
	registry: SchemaRegistry,
): readonly ChildNode[] {
	const allow: readonly string[] | undefined = registry.getNodeSpec(block.type)?.content?.allow;
	const leafCapable: boolean = allow?.includes('text') ?? false;

	if (kept.length === 0) {
		return leafCapable
			? [createTextNode('')]
			: [createBlockNode(nodeType('paragraph'), [createTextNode('')])];
	}

	const only: ChildNode | undefined = kept.length === 1 ? kept[0] : undefined;
	if (leafCapable && only && isBlockNode(only) && only.type === 'paragraph' && !only.attrs) {
		const inline = getInlineChildren(only);
		return inline.length > 0 ? [...inline] : [createTextNode('')];
	}
	return kept;
}
