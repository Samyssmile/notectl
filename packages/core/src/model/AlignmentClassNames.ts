/**
 * Application-defined CSS class names for block alignment in content HTML (#270).
 *
 * Keys are logical alignments, values are single CSS class names. Class-based
 * HTML export writes the class and HTML import maps it back to the alignment,
 * so the document keeps storing only the semantic `align` attribute.
 */

import { BLOCK_ALIGNMENTS, type BlockAlignment, isBlockAlignment } from './BlockAlignment.js';

/** CSS class names per block alignment. Omitted alignments keep notectl's default names. */
export type AlignmentClassNames = Readonly<Partial<Record<BlockAlignment, string>>>;

/** Reserved for the class names notectl generates itself (`notectl-align-*`, `notectl-s-*`). */
const RESERVED_PREFIX = 'notectl-';

/** One CSS identifier that is valid in a `class` attribute and a selector without escaping. */
const CLASS_NAME_PATTERN: RegExp = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

/** Physical alignments people coming from other editors tend to reach for. */
const PHYSICAL_ALIGNMENTS: ReadonlyMap<string, BlockAlignment> = new Map([
	['left', 'start'],
	['right', 'end'],
]);

const CLASS_NAME_RULE =
	'use one CSS class name of letters, digits, "-" and "_", not starting with a digit';

/**
 * Validates alignment class names and returns a frozen copy without unset entries.
 * Throws a `TypeError` that explains how to fix the first problem it finds.
 */
export function validateAlignmentClassNames(classNames: AlignmentClassNames): AlignmentClassNames {
	if (typeof classNames !== 'object' || classNames === null || Array.isArray(classNames)) {
		throw new TypeError(
			"Alignment class names must be an object, e.g. { center: 'align-center' }.",
		);
	}

	const validated: Partial<Record<BlockAlignment, string>> = {};
	const owners = new Map<string, BlockAlignment>();
	for (const [key, className] of Object.entries(classNames)) {
		if (className === undefined) continue;
		const alignment: BlockAlignment = toAlignment(key);
		assertClassName(alignment, className);
		const owner: BlockAlignment | undefined = owners.get(className);
		if (owner) {
			throw new TypeError(
				`Class "${className}" is mapped to both "${owner}" and "${alignment}"; use one class each.`,
			);
		}
		owners.set(className, alignment);
		validated[alignment] = className;
	}
	return Object.freeze(validated);
}

function toAlignment(key: string): BlockAlignment {
	if (isBlockAlignment(key)) return key;
	const logical: BlockAlignment | undefined = PHYSICAL_ALIGNMENTS.get(key);
	const hint: string = logical
		? ` Alignment is logical: "${logical}" is ${key} in left-to-right text.`
		: '';
	throw new TypeError(`Unknown alignment "${key}"; use ${BLOCK_ALIGNMENTS.join(', ')}.${hint}`);
}

function assertClassName(
	alignment: BlockAlignment,
	className: unknown,
): asserts className is string {
	if (typeof className !== 'string' || !CLASS_NAME_PATTERN.test(className)) {
		throw new TypeError(
			`Invalid class name ${JSON.stringify(className)} for "${alignment}": ${CLASS_NAME_RULE}.`,
		);
	}
	if (className.startsWith(RESERVED_PREFIX)) {
		throw new TypeError(
			`Class "${className}" for "${alignment}" uses the reserved prefix "${RESERVED_PREFIX}".`,
		);
	}
}
