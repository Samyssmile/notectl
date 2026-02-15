/**
 * Module-augmentable attribute registries for type-safe node/mark attributes.
 *
 * Plugins extend these interfaces via `declare module`:
 * @example
 * declare module '../../model/AttrRegistry.js' {
 *   interface NodeAttrRegistry {
 *     heading: { level: HeadingLevel; align?: BlockAlignment };
 *   }
 * }
 */

import type { BlockAlignment } from '../plugins/alignment/AlignmentPlugin.js';
import type { BlockNode, InlineNode, Mark } from './Document.js';
import { isInlineNode } from './Document.js';

/** Plugins augment this interface to register typed node attributes. */
export interface NodeAttrRegistry {
	paragraph: { align?: BlockAlignment };
}

/** Plugins augment this interface to register typed mark attributes. */
export interface MarkAttrRegistry {
	bold: Record<string, never>;
	italic: Record<string, never>;
	underline: Record<string, never>;
}

/** Resolves typed attributes for known node types, falls back for unknown. */
export type NodeAttrsFor<T extends string> = T extends keyof NodeAttrRegistry
	? NodeAttrRegistry[T]
	: Record<string, string | number | boolean>;

/** Resolves typed attributes for known mark types, falls back for unknown. */
export type MarkAttrsFor<T extends string> = T extends keyof MarkAttrRegistry
	? MarkAttrRegistry[T]
	: Record<string, string | number | boolean>;

/** Narrows a BlockNode to a typed variant with known attributes. */
export function isNodeOfType<T extends keyof NodeAttrRegistry>(
	node: BlockNode,
	type: T,
): node is BlockNode & { readonly type: T; readonly attrs: NodeAttrRegistry[T] } {
	return (node.type as string) === type;
}

/** Narrows a Mark to a typed variant with known attributes. */
export function isMarkOfType<T extends keyof MarkAttrRegistry>(
	mark: Mark,
	type: T,
): mark is Mark & { readonly type: T; readonly attrs: MarkAttrRegistry[T] } {
	return (mark.type as string) === type;
}

// --- InlineNode Attribute Registry ---

/** Plugins augment this interface to register typed inline node attributes. */
// biome-ignore lint/suspicious/noEmptyInterface: module augmentation requires interface
export interface InlineNodeAttrRegistry {}

/** Resolves typed attributes for known inline node types, falls back for unknown. */
export type InlineNodeAttrsFor<T extends string> = T extends keyof InlineNodeAttrRegistry
	? InlineNodeAttrRegistry[T]
	: Record<string, string | number | boolean>;

/** Narrows an InlineNode to a typed variant with known attributes. */
export function isInlineNodeOfType<T extends keyof InlineNodeAttrRegistry>(
	node: InlineNode,
	inlineNodeType: T,
): node is InlineNode & {
	readonly inlineType: T;
	readonly attrs: InlineNodeAttrRegistry[T];
} {
	return isInlineNode(node) && (node.inlineType as string) === inlineNodeType;
}
