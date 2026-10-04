/**
 * DocumentSerializer: converts an immutable Document into sanitized HTML.
 * Pure functions — operates on Document/SchemaRegistry, no class state.
 */

import type { AlignmentClassNames } from '../model/AlignmentClassNames.js';
import { isNodeOfType } from '../model/AttrRegistry.js';
import type { BlockAlignment } from '../model/BlockAlignment.js';
import type { BlockNode, Document, InlineNode, TextNode } from '../model/Document.js';
import {
	getBlockChildren,
	getInlineChildren,
	isInlineNode,
	isLeafBlock,
	isTextNode,
	markSetsEqual,
} from '../model/Document.js';
import {
	INLINE_STYLE_EXPORT_CONTEXT,
	SAFE_URI_REGEXP,
	escapeAttr,
	escapeHTML,
} from '../model/HTMLUtils.js';
import type { HTMLExportContext, NodeSpec } from '../model/NodeSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	alignmentDeclaration,
	alignmentSemanticClassNames,
	resolveExportAlignment,
} from './AlignmentHTML.js';
import { isSafeBlockId } from './BlockIdHTML.js';
import { CSSClassCollector } from './CSSClassCollector.js';
import type { ContentCSSResult, SerializeOptions } from './ContentHTMLTypes.js';
import {
	firstOpeningTag,
	injectAttrIntoFirstTag,
	setHTMLIdOnFirstTag,
} from './FirstTagAttributes.js';
import { preserveHTMLIdSanitizeConfig, sanitizeHTML } from './HTMLSanitization.js';
import {
	buildMarkOrder,
	serializeInlineNodeMarksToClassHTML,
	serializeInlineNodeMarksToHTML,
	serializeMarksToClassHTML,
	serializeMarksToHTML,
} from './MarkSerializer.js';

/** Internal context threaded through all serialization helpers. */
interface SerializerContext {
	readonly registry?: SchemaRegistry;
	readonly collector?: CSSClassCollector;
	readonly exportCtx?: HTMLExportContext;
	/** Resolved from {@link SerializeOptions.includeBlockIds}; defaults to `true`. */
	readonly includeBlockIds: boolean;
	/** Application alignment classes; set in class mode only, inline mode keeps styles. */
	readonly alignmentClassNames?: AlignmentClassNames;
	/** Alignment the blocks being serialized inherit from the nearest ancestor that writes one. */
	readonly inheritedAlignment?: BlockAlignment;
}

/** Known-safe direction values (defense-in-depth). `auto` is excluded — it's the default. */
export const VALID_DIRECTIONS: ReadonlySet<string> = new Set(['ltr', 'rtl']);

/** Creates an HTMLExportContext for CSS class mode. */
function createClassExportContext(collector: CSSClassCollector): HTMLExportContext {
	return {
		styleAttr(declarations: string): string {
			if (!declarations) return '';
			const className: string = collector.getClassName(declarations);
			return ` class="${className}"`;
		},
	};
}

/**
 * DOMPurify config fragment that controls `data-block-id` in the output.
 *
 * `data-block-id` is a `data-*` attribute, which DOMPurify permits by default
 * (`ALLOW_DATA_ATTR`) regardless of `ALLOWED_ATTR`. Excluding it therefore
 * requires `FORBID_ATTR` — this is the load-bearing strip that guarantees clean
 * output even when a third-party `NodeSpec.toHTML` emits its own id (the central
 * injection in `serializeBlock` is merely skipped). Including it needs no special
 * config; the centrally injected attribute passes as a data-* attribute.
 */
function blockIdSanitizeConfig(includeBlockIds: boolean): {
	readonly SANITIZE_DOM: false;
	readonly FORBID_ATTR?: string[];
} {
	return preserveHTMLIdSanitizeConfig(...(includeBlockIds ? [] : ['data-block-id']));
}

/** Serializes a full document to sanitized HTML, wrapping list items in `<ul>`/`<ol>`. */
export function serializeDocumentToHTML(
	doc: Document,
	registry?: SchemaRegistry,
	options?: SerializeOptions,
): string {
	const includeBlockIds: boolean = options?.includeBlockIds !== false;
	const exportCtx: HTMLExportContext = INLINE_STYLE_EXPORT_CONTEXT;
	const ctx: SerializerContext = { registry, exportCtx, includeBlockIds };
	const html: string = serializeBlocks(doc.children, ctx);

	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style', 'dir', 'id'];

	return sanitizeHTML(
		html,
		{
			ALLOWED_TAGS: allowedTags,
			ALLOWED_ATTR: allowedAttrs,
			ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
			...blockIdSanitizeConfig(includeBlockIds),
		},
		registry,
	);
}

/**
 * Serializes a document to HTML with CSS class names instead of inline styles.
 * Returns the HTML and a collected stylesheet with only the rules actually used.
 */
export function serializeDocumentToCSS(
	doc: Document,
	registry?: SchemaRegistry,
	options?: SerializeOptions,
): ContentCSSResult {
	const includeBlockIds: boolean = options?.includeBlockIds !== false;
	const alignmentClassNames: AlignmentClassNames | undefined = registry?.getAlignmentClassNames();
	const collector = new CSSClassCollector(alignmentSemanticClassNames(alignmentClassNames));
	const exportCtx: HTMLExportContext = createClassExportContext(collector);
	const ctx: SerializerContext = {
		registry,
		collector,
		exportCtx,
		includeBlockIds,
		alignmentClassNames,
	};
	const html: string = serializeBlocks(doc.children, ctx);

	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const baseAttrs: string[] = registry
		? registry.getAllowedAttrs()
		: ['style', 'class', 'dir', 'id'];

	// In class mode, allow `class` through DOMPurify (it is not a data-* attr, so
	// it must be in ALLOWED_ATTR).
	const withClass: string[] = baseAttrs.includes('class')
		? [...baseAttrs]
		: [...baseAttrs, 'class'];

	// Defense-in-depth: strip `style` attribute in class mode to guarantee
	// zero inline styles — even from third-party plugins that forgot to use ctx.styleAttr().
	const filteredAttrs: string[] = withClass.filter((attr) => attr !== 'style');

	const sanitizedHTML: string = sanitizeHTML(
		html,
		{
			ALLOWED_TAGS: allowedTags,
			ALLOWED_ATTR: filteredAttrs,
			ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
			...blockIdSanitizeConfig(includeBlockIds),
		},
		registry,
	);

	return { html: sanitizedHTML, css: collector.toCSS(), styleMap: collector.toStyleMap() };
}

/** Serializes a sequence of blocks to HTML, grouping consecutive list items into wrappers. */
function serializeBlocks(blocks: readonly BlockNode[], ctx: SerializerContext): string {
	const parts: string[] = [];
	let i = 0;

	while (i < blocks.length) {
		const block: BlockNode | undefined = blocks[i];
		if (!block) {
			i++;
			continue;
		}

		if (isNodeOfType(block, 'list_item')) {
			// Collect consecutive list items
			const listItems: BlockNode[] = [];
			while (i < blocks.length) {
				const item: BlockNode | undefined = blocks[i];
				if (!item || !isNodeOfType(item, 'list_item')) break;
				listItems.push(item);
				i++;
			}
			parts.push(serializeListGroup(listItems, ctx));
		} else {
			parts.push(serializeBlock(block, ctx));
			i++;
		}
	}

	return parts.join('');
}

/**
 * Serializes a group of consecutive list items into properly nested `<ul>`/`<ol>` wrappers.
 * Uses a stack-based algorithm to handle indent-based nesting.
 * Produces valid HTML5: nested lists open *inside* the parent `<li>`.
 */
function serializeListGroup(items: readonly BlockNode[], ctx: SerializerContext): string {
	const parts: string[] = [];
	const stack: { tag: string; indent: number }[] = [];

	for (let idx = 0; idx < items.length; idx++) {
		const item: BlockNode | undefined = items[idx];
		if (!item) continue;

		const listType: string = (item.attrs?.listType as string) ?? 'bullet';
		const indent: number = (item.attrs?.indent as number) ?? 0;
		const tag: string = listType === 'ordered' ? 'ol' : 'ul';
		// Pop wrapper levels that are deeper than current indent,
		// or at the same level when the tag type changes
		while (stack.length > 0) {
			const top = stack[stack.length - 1];
			if (!top) break;

			if (top.indent > indent) {
				parts.push(`</${top.tag}></li>`);
				stack.pop();
			} else if (top.indent === indent && top.tag !== tag) {
				parts.push(`</${top.tag}></li>`);
				stack.pop();
			} else {
				break;
			}
		}

		if (stack.length === 0) {
			parts.push(`<${tag}>`);
			stack.push({ tag, indent });
		} else {
			const top = stack[stack.length - 1];
			if (top && indent > top.indent) {
				parts.push(`<${tag}>`);
				stack.push({ tag, indent });
			}
		}

		const content: string = serializeBlock(item, ctx);

		// Look ahead: if the next item is deeper, strip </li> so the nested
		// list opens inside this <li> (valid HTML5 nesting).
		const nextItem: BlockNode | undefined = items[idx + 1];
		const nextIndent: number | undefined = nextItem
			? ((nextItem.attrs?.indent as number) ?? 0)
			: undefined;

		if (nextIndent !== undefined && nextIndent > indent) {
			parts.push(stripTrailingLiClose(content));
		} else {
			parts.push(content);
		}
	}

	// Close all remaining open wrappers
	while (stack.length > 0) {
		const top = stack.pop();
		if (!top) break;
		parts.push(`</${top.tag}>`);
		if (stack.length > 0) {
			parts.push('</li>');
		}
	}

	return parts.join('');
}

/** Removes the trailing `</li>` from serialized list item HTML. */
function stripTrailingLiClose(html: string): string {
	const suffix = '</li>';
	if (html.endsWith(suffix)) {
		return html.slice(0, -suffix.length);
	}
	return html;
}

/** Serializes a single block to HTML using its NodeSpec. */
function serializeBlock(block: BlockNode, ctx: SerializerContext): string {
	const spec: NodeSpec | undefined = ctx.registry?.getNodeSpec(block.type);
	const alignment: BlockAlignment | undefined = resolveExportAlignment(block, spec, {
		classNames: ctx.alignmentClassNames,
		inherited: ctx.inheritedAlignment,
	});
	const content: string = isLeafBlock(block)
		? serializeInlineContent(block, ctx)
		: serializeBlocks(getBlockChildren(block), inheritAlignment(ctx, alignment));

	let html: string;
	if (spec?.toHTML) {
		html = spec.toHTML(block, content, ctx.exportCtx);
	} else {
		html = `<p>${content || '<br>'}</p>`;
	}

	// Centrally inject `data-block-id` so each `NodeSpec.toHTML` is relieved of
	// the responsibility — and the round-trip identity contract holds for every
	// block type, including ones added by future plugins. The serializer's
	// allowlist passes `data-block-id` through DOMPurify. Skip if the spec
	// already emits one (mirrors the existing `dir` defense-in-depth pattern).
	// `escapeAttr` is defense-in-depth — `isSafeBlockId` already excludes any
	// character that would need escaping. Skipped entirely when the caller opted
	// out via `includeBlockIds: false`; the allowlist strip is the guarantee.
	if (ctx.includeBlockIds && isSafeBlockId(block.id)) {
		if (!firstOpeningTag(html).includes(' data-block-id=')) {
			html = injectAttrIntoFirstTag(html, 'data-block-id', escapeAttr(block.id));
		}
	}

	// HTML IDs are semantic, document-local targets and therefore independent of
	// the editor's internal `data-block-id` wire identity. The model value wins
	// over a NodeSpec-provided `id` so serialization can never emit duplicates.
	html = setHTMLIdOnFirstTag(html, block.htmlId);

	html = injectAlignment(html, alignment, ctx);

	// Defense-in-depth: inject dir into the first opening tag if not already present.
	// NodeSpec toHTML may already inject it; this ensures it survives even without a plugin.
	const dir: string | undefined = (block.attrs as Record<string, unknown>)?.dir as
		| string
		| undefined;
	if (dir && VALID_DIRECTIONS.has(dir)) {
		if (!firstOpeningTag(html).includes(' dir=')) {
			html = injectAttrIntoFirstTag(html, 'dir', escapeAttr(dir));
		}
	}

	return html;
}

/** The context for a block's children: they inherit the alignment the block writes. */
function inheritAlignment(
	ctx: SerializerContext,
	alignment: BlockAlignment | undefined,
): SerializerContext {
	return alignment ? { ...ctx, inheritedAlignment: alignment } : ctx;
}

/**
 * Writes the block's resolved alignment into the first opening tag: a class in
 * class mode, an inline `text-align` otherwise. `resolveExportAlignment` returns
 * only valid alignments; the class name is escaped as defense-in-depth.
 */
function injectAlignment(
	html: string,
	alignment: BlockAlignment | undefined,
	ctx: SerializerContext,
): string {
	if (!alignment) return html;
	const declaration: string = alignmentDeclaration(alignment);
	return ctx.collector
		? injectAttrIntoFirstTag(html, 'class', escapeAttr(ctx.collector.getClassName(declaration)))
		: injectAttrIntoFirstTag(html, 'style', escapeAttr(declaration));
}

/** Serializes inline children (TextNode + InlineNode) of a block. */
function serializeInlineContent(block: BlockNode, ctx: SerializerContext): string {
	const children: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
	const merged: readonly (TextNode | InlineNode)[] = mergeAdjacentTextNodes(children);
	const parts: string[] = [];
	const markOrder: Map<string, number> | undefined = ctx.registry
		? buildMarkOrder(ctx.registry)
		: undefined;

	for (const child of merged) {
		if (isInlineNode(child)) {
			const inlineSpec = ctx.registry?.getInlineNodeSpec(child.inlineType);
			if (inlineSpec?.toHTMLString) {
				const inlineHTML: string = inlineSpec.toHTMLString(child);
				// Wrap the atomic node in its marks (e.g. a linked inline image → <a><img></a>).
				if (ctx.registry && child.marks.length > 0) {
					parts.push(
						ctx.collector
							? serializeInlineNodeMarksToClassHTML(
									inlineHTML,
									child.marks,
									ctx.registry,
									ctx.collector,
									markOrder,
									ctx.exportCtx,
								)
							: serializeInlineNodeMarksToHTML(
									inlineHTML,
									child.marks,
									ctx.registry,
									markOrder,
									ctx.exportCtx,
								),
					);
				} else {
					parts.push(inlineHTML);
				}
			}
		} else if (ctx.registry && ctx.collector) {
			parts.push(
				serializeMarksToClassHTML(
					child.text,
					child.marks,
					ctx.registry,
					ctx.collector,
					markOrder,
					ctx.exportCtx,
				),
			);
		} else if (ctx.registry) {
			parts.push(
				serializeMarksToHTML(child.text, child.marks, ctx.registry, markOrder, ctx.exportCtx),
			);
		} else if (child.text !== '') {
			parts.push(escapeHTML(child.text));
		}
	}

	return parts.join('');
}

/**
 * Merges adjacent TextNodes that share identical mark sets.
 * InlineNodes act as merge boundaries.
 */
function mergeAdjacentTextNodes(
	children: readonly (TextNode | InlineNode)[],
): readonly (TextNode | InlineNode)[] {
	if (children.length <= 1) return children;

	const result: (TextNode | InlineNode)[] = [];

	for (const child of children) {
		if (isInlineNode(child)) {
			result.push(child);
			continue;
		}

		const prev: TextNode | InlineNode | undefined = result[result.length - 1];
		if (prev && isTextNode(prev) && markSetsEqual(prev.marks, child.marks)) {
			result[result.length - 1] = {
				type: 'text',
				text: prev.text + child.text,
				marks: prev.marks,
			};
		} else {
			result.push(child);
		}
	}

	return result;
}
