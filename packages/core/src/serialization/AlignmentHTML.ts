/**
 * Shared rules for block alignment in HTML.
 *
 * Alignment is a logical block attribute (`start`, `center`, `end`, `justify`).
 * HTML carries it as an inline `text-align` style or, in class mode, as one CSS
 * class per alignment: the application's own class when one is registered
 * (#270), otherwise `notectl-align-<alignment>`. Serializer and parser must agree
 * on these shapes; this module is the single source of truth.
 */

import type { AlignmentClassNames } from '../model/AlignmentClassNames.js';
import {
	BLOCK_ALIGNMENTS,
	type BlockAlignment,
	isBlockAlignment,
} from '../model/BlockAlignment.js';
import type { BlockNode } from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';

/** Known-safe alignment values accepted by the serializer (defense-in-depth). */
export const VALID_ALIGNMENTS: ReadonlySet<string> = new Set<string>(BLOCK_ALIGNMENTS);

/** Physical values from older content, mapped to their logical equivalent. */
const LEGACY_ALIGNMENTS: ReadonlyMap<string, BlockAlignment> = new Map([
	['left', 'start'],
	['right', 'end'],
]);

/** Prefix of notectl's own alignment class names. */
const DEFAULT_CLASS_PREFIX = 'notectl-align-';

/** Browsers render blocks start-aligned, so `start` needs no markup by default. */
const BROWSER_DEFAULT_ALIGNMENT: BlockAlignment = 'start';

/** Validates a stored or parsed alignment value and maps legacy `left`/`right`. */
export function normalizeAlignment(value: unknown): BlockAlignment | undefined {
	if (isBlockAlignment(value)) return value;
	return typeof value === 'string' ? LEGACY_ALIGNMENTS.get(value) : undefined;
}

/** The CSS declaration that renders `alignment`. */
export function alignmentDeclaration(alignment: BlockAlignment): string {
	return `text-align: ${alignment}`;
}

/**
 * Maps the declaration of every alignment to its class name: the registered
 * application class, or notectl's default `notectl-align-*` name.
 */
export function alignmentSemanticClassNames(
	classNames?: AlignmentClassNames,
): ReadonlyMap<string, string> {
	return new Map(
		BLOCK_ALIGNMENTS.map((alignment) => [
			alignmentDeclaration(alignment),
			classNames?.[alignment] ?? `${DEFAULT_CLASS_PREFIX}${alignment}`,
		]),
	);
}

/**
 * Reads an element's alignment. An inline `text-align` wins, as it does in CSS;
 * otherwise the first class naming an alignment decides: a registered class or
 * one of notectl's `notectl-align-*` classes.
 */
export function readElementAlignment(
	el: HTMLElement,
	classNames?: AlignmentClassNames,
): BlockAlignment | undefined {
	const fromStyle: BlockAlignment | undefined = normalizeAlignment(el.style?.textAlign);
	if (fromStyle) return fromStyle;

	for (const className of Array.from(el.classList)) {
		const fromClass: BlockAlignment | undefined = alignmentOfClass(className, classNames);
		if (fromClass) return fromClass;
	}
	return undefined;
}

/** Where a block sits in the exported HTML, as far as its alignment markup is concerned. */
export interface AlignmentExportOptions {
	/** Registered application classes; the serializer passes them in class mode only. */
	readonly classNames?: AlignmentClassNames;
	/**
	 * The alignment the block inherits in the exported HTML from the nearest
	 * ancestor that writes one, such as an aligned table cell.
	 */
	readonly inherited?: BlockAlignment;
}

/**
 * Returns the alignment the serializer writes for `block`, or `undefined` when
 * the HTML needs no alignment markup. A block's effective alignment is its own
 * `align` attribute, or the default its spec declares (images are centered).
 * Markup is needed when that alignment differs from the browser default or from
 * the block's own default (so import restores it). Otherwise the block inherits
 * the alignment of its container, as it does in the editor: a registered
 * `start` class marks it only where no ancestor writes an alignment.
 */
export function resolveExportAlignment(
	block: BlockNode,
	spec: NodeSpec | undefined,
	options: AlignmentExportOptions = {},
): BlockAlignment | undefined {
	const specDefault: BlockAlignment =
		normalizeAlignment(spec?.attrs?.align?.default) ?? BROWSER_DEFAULT_ALIGNMENT;
	const alignment: BlockAlignment | undefined =
		normalizeAlignment(block.attrs?.align) ?? (spec?.attrs?.align ? specDefault : undefined);
	if (!alignment) return undefined;
	if (alignment !== BROWSER_DEFAULT_ALIGNMENT || alignment !== specDefault) return alignment;

	const pinnedByClass: boolean =
		options.classNames?.start !== undefined && options.inherited === undefined;
	return pinnedByClass ? alignment : undefined;
}

function alignmentOfClass(
	className: string,
	classNames: AlignmentClassNames | undefined,
): BlockAlignment | undefined {
	const registered: BlockAlignment | undefined = BLOCK_ALIGNMENTS.find(
		(alignment) => classNames?.[alignment] === className,
	);
	if (registered) return registered;
	if (!className.startsWith(DEFAULT_CLASS_PREFIX)) return undefined;
	return normalizeAlignment(className.slice(DEFAULT_CLASS_PREFIX.length));
}
