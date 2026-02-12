/**
 * Branded (nominal) types for semantic string distinctions.
 * Prevents accidental interchange of structurally identical IDs.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Unique identifier for a block node in the document tree. */
export type BlockId = Brand<string, 'BlockId'>;

/** Semantic name for a node type (e.g. 'paragraph', 'heading'). */
export type NodeTypeName = Brand<string, 'NodeTypeName'>;

/** Semantic name for a mark type (e.g. 'bold', 'link'). */
export type MarkTypeName = Brand<string, 'MarkTypeName'>;

/** Unique identifier for a plugin. */
export type PluginId = Brand<string, 'PluginId'>;

/** Registered command name. */
export type CommandName = Brand<string, 'CommandName'>;

/** Semantic name for an inline node type (e.g. 'image', 'mention'). */
export type InlineTypeName = Brand<string, 'InlineTypeName'>;

// --- Constructor Functions ---

export function blockId(id: string): BlockId {
	return id as BlockId;
}

export function nodeType(name: string): NodeTypeName {
	return name as NodeTypeName;
}

export function markType(name: string): MarkTypeName {
	return name as MarkTypeName;
}

export function pluginId(id: string): PluginId {
	return id as PluginId;
}

export function commandName(name: string): CommandName {
	return name as CommandName;
}

export function inlineType(name: string): InlineTypeName {
	return name as InlineTypeName;
}
