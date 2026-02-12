/**
 * NodeSpec: defines how a block-node type behaves and renders to the DOM.
 */

import type { NodeAttrsFor } from './AttrRegistry.js';
import type { BlockNode } from './Document.js';
import type { BlockId } from './TypeBrands.js';

export interface AttrSpec {
	readonly default?: string | number | boolean;
}

/** Describes which children a node type is allowed to contain. */
export interface ContentRule {
	/** Allowed child types or group names. */
	readonly allow: readonly string[];
	readonly min?: number;
	readonly max?: number;
}

/** Creates an HTMLElement with the required `data-block-id` attribute. */
export function createBlockElement(tag: string, blockId: BlockId): HTMLElement {
	const el = document.createElement(tag);
	el.setAttribute('data-block-id', blockId);
	return el;
}

export interface NodeSpec<T extends string = string> {
	readonly type: T;
	/** Renders the block to a DOM element. Must set `data-block-id` on the root. */
	toDOM(node: Omit<BlockNode, 'attrs'> & { readonly attrs: NodeAttrsFor<T> }): HTMLElement;
	readonly attrs?: Readonly<Record<string, AttrSpec>>;
	/** If true, the node contains no editable text (e.g. Image, HR). */
	readonly isVoid?: boolean;
	/** Content model: which children this node can contain. */
	readonly content?: ContentRule;
	/** Group membership: 'block' | 'inline' | custom. */
	readonly group?: string;
	/** If true, selection cannot cross this node's boundary (e.g. table_cell). */
	readonly isolating?: boolean;
}
