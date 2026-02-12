/**
 * Content model validation for nested document structures.
 * Validates whether a parent node type can contain given child types.
 */

import type { SchemaRegistry } from './SchemaRegistry.js';

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
