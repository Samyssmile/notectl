/**
 * Schema definition for the Notectl editor.
 * Defines which node types and marks are allowed.
 */

import type { NodeSpec } from './NodeSpec.js';
import type { SchemaRegistry } from './SchemaRegistry.js';

export interface Schema {
	readonly nodeTypes: readonly string[];
	readonly markTypes: readonly string[];
	/** Looks up the full NodeSpec for a given type. Available when created via schemaFromRegistry. */
	readonly getNodeSpec?: (type: string) => NodeSpec | undefined;
}

/** Creates the default schema with paragraph nodes and bold/italic/underline marks. */
export function defaultSchema(): Schema {
	return {
		nodeTypes: ['paragraph'],
		markTypes: ['bold', 'italic', 'underline'],
		getNodeSpec: () => undefined,
	};
}

/** Derives a Schema from a SchemaRegistry's registered specs. */
export function schemaFromRegistry(registry: SchemaRegistry): Schema {
	return {
		nodeTypes: registry.getNodeTypes(),
		markTypes: registry.getMarkTypes(),
		getNodeSpec: (type: string) => registry.getNodeSpec(type),
	};
}

/** Checks whether the given mark type is allowed by the schema. */
export function isMarkAllowed(schema: Schema, markType: string): boolean {
	return schema.markTypes.includes(markType);
}

/** Checks whether the given node type is allowed by the schema. */
export function isNodeTypeAllowed(schema: Schema, nodeType: string): boolean {
	return schema.nodeTypes.includes(nodeType);
}
