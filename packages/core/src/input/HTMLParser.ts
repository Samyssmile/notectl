/**
 * HTMLParser: converts sanitized HTML DOM into a ContentSlice.
 * Works on DOM nodes (not strings), is schema-aware, and produces immutable output.
 */

import type { ContentSlice, SliceBlock } from '../model/ContentSlice.js';
import type { Mark, TextSegment } from '../model/Document.js';
import { markSetsEqual } from '../model/Document.js';
import type { ParseRule } from '../model/ParseRule.js';
import type { Schema } from '../model/Schema.js';
import { isMarkAllowed, isNodeTypeAllowed } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { NodeTypeName } from '../model/TypeBrands.js';
import { markType, nodeType } from '../model/TypeBrands.js';

export interface HTMLParserOptions {
	readonly schema: Schema;
	readonly schemaRegistry?: SchemaRegistry;
}

const BLOCK_ELEMENTS: ReadonlySet<string> = new Set([
	'P',
	'DIV',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'BLOCKQUOTE',
	'UL',
	'OL',
	'LI',
	'HR',
	'PRE',
	'TABLE',
	'THEAD',
	'TBODY',
	'TR',
]);

const INLINE_ELEMENTS: ReadonlySet<string> = new Set([
	'STRONG',
	'B',
	'EM',
	'I',
	'U',
	'S',
	'STRIKE',
	'DEL',
	'A',
	'SPAN',
	'BR',
	'SUB',
	'SUP',
	'CODE',
]);

const HEADING_PATTERN: RegExp = /^H([1-6])$/;

// --- Fallback mark resolution (when no SchemaRegistry rules match) ---

interface FallbackMarkDef {
	readonly markName: string;
	readonly getAttrs?: (el: HTMLElement) => Record<string, unknown> | false;
}

function resolveBoldAttrs(el: HTMLElement): Record<string, unknown> | false {
	const fw: string = el.style.fontWeight;
	const numeric: number = Number.parseInt(fw, 10);
	const isExplicitlyNotBold: boolean = fw === 'normal' || (!Number.isNaN(numeric) && numeric < 700);
	return isExplicitlyNotBold ? false : {};
}

function resolveLinkAttrs(el: HTMLElement): Record<string, unknown> {
	return { href: el.getAttribute('href') ?? '' };
}

const FALLBACK_MARK_MAP: ReadonlyMap<string, FallbackMarkDef> = new Map([
	['STRONG', { markName: 'bold', getAttrs: resolveBoldAttrs }],
	['B', { markName: 'bold', getAttrs: resolveBoldAttrs }],
	['EM', { markName: 'italic' }],
	['I', { markName: 'italic' }],
	['U', { markName: 'underline' }],
	['S', { markName: 'strikethrough' }],
	['STRIKE', { markName: 'strikethrough' }],
	['DEL', { markName: 'strikethrough' }],
	['A', { markName: 'link', getAttrs: resolveLinkAttrs }],
]);

// --- Parser ---

export class HTMLParser {
	private readonly schema: Schema;
	private readonly blockParseRules: readonly {
		readonly rule: ParseRule;
		readonly type: string;
	}[];
	private readonly markParseRules: readonly {
		readonly rule: ParseRule;
		readonly type: string;
	}[];
	private readonly blockTagHandlers: ReadonlyMap<string, (el: HTMLElement) => SliceBlock[]>;

	constructor(options: HTMLParserOptions) {
		this.schema = options.schema;
		this.blockParseRules = options.schemaRegistry?.getBlockParseRules() ?? [];
		this.markParseRules = options.schemaRegistry?.getMarkParseRules() ?? [];
		this.blockTagHandlers = this.buildBlockTagHandlers();
	}

	/** Parses an HTML fragment and returns a ContentSlice. */
	parse(container: DocumentFragment | HTMLElement): ContentSlice {
		const blocks: SliceBlock[] = this.parseContainer(container);

		if (blocks.length === 0) {
			return {
				blocks: [
					{
						type: this.resolveBlockType(nodeType('paragraph')),
						segments: [{ text: '', marks: [] }],
					},
				],
			};
		}

		return { blocks };
	}

	private buildBlockTagHandlers(): ReadonlyMap<string, (el: HTMLElement) => SliceBlock[]> {
		const parseParagraph = (el: HTMLElement): SliceBlock[] =>
			this.parseBlockWithLineBreaks(el, this.resolveBlockType(nodeType('paragraph')));
		const parseTable = (el: HTMLElement): SliceBlock[] => this.parseTableAsParagraphs(el);

		return new Map<string, (el: HTMLElement) => SliceBlock[]>([
			['P', parseParagraph],
			['DIV', parseParagraph],
			['BLOCKQUOTE', (el: HTMLElement) => this.parseBlockquote(el)],
			['UL', (el: HTMLElement) => this.parseList(el, 'bullet', 0)],
			['OL', (el: HTMLElement) => this.parseList(el, 'ordered', 0)],
			['LI', (el: HTMLElement) => this.parseListItem(el, 'bullet', 0)],
			[
				'HR',
				() => [
					{
						type: this.resolveBlockType(nodeType('horizontal_rule')),
						segments: [],
					},
				],
			],
			[
				'PRE',
				(el: HTMLElement) => [
					{
						type: this.resolveBlockType(nodeType('paragraph')),
						segments: this.ensureSegments(this.parsePreContent(el)),
					},
				],
			],
			['TABLE', parseTable],
			['THEAD', parseTable],
			['TBODY', parseTable],
			['TR', parseTable],
		]);
	}

	private parseContainer(container: DocumentFragment | HTMLElement): SliceBlock[] {
		const blocks: SliceBlock[] = [];
		let pendingSegments: TextSegment[] = [];

		for (const child of Array.from(container.childNodes)) {
			if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;

				if (this.isBlockElement(el)) {
					this.flushPendingSegments(blocks, pendingSegments);
					pendingSegments = [];
					blocks.push(...this.parseBlockElement(el));
				} else if (el.children.length > 0 && this.containsBlockDescendants(el)) {
					this.flushPendingSegments(blocks, pendingSegments);
					pendingSegments = [];
					blocks.push(...this.parseContainerWithMarks(el, this.marksFromElement(el)));
				} else {
					pendingSegments.push(...this.parseInlineNode(child, []));
				}
			} else if (child.nodeType === Node.TEXT_NODE) {
				const text: string = child.textContent ?? '';
				if (text) {
					pendingSegments.push({ text, marks: [] });
				}
			}
		}

		this.flushPendingSegments(blocks, pendingSegments);
		return blocks;
	}

	private parseBlockElement(element: HTMLElement): SliceBlock[] {
		const headingMatch: RegExpExecArray | null = HEADING_PATTERN.exec(element.tagName);
		if (headingMatch) {
			return this.parseHeading(element, Number(headingMatch[1]));
		}

		const handler = this.blockTagHandlers.get(element.tagName);
		if (handler) return handler(element);

		return this.parseUnknownBlock(element);
	}

	private parseHeading(element: HTMLElement, level: number): SliceBlock[] {
		const blockType: NodeTypeName = this.resolveBlockType(nodeType('heading'));
		return [
			{
				type: blockType,
				...(blockType === nodeType('heading') ? { attrs: { level } } : {}),
				segments: this.ensureSegments(this.parseInlineChildren(element, [])),
			},
		];
	}

	private parseUnknownBlock(element: HTMLElement): SliceBlock[] {
		const blockMatch = this.matchBlockRule(element);
		if (blockMatch) {
			return [
				{
					type: blockMatch.type,
					...(blockMatch.attrs ? { attrs: blockMatch.attrs } : {}),
					segments: this.ensureSegments(this.parseInlineChildren(element, [])),
				},
			];
		}
		return [
			{
				type: this.resolveBlockType(nodeType('paragraph')),
				segments: this.ensureSegments(this.parseInlineChildren(element, [])),
			},
		];
	}

	private parseBlockquote(element: HTMLElement): SliceBlock[] {
		const blockType: NodeTypeName = this.resolveBlockType(nodeType('blockquote'));
		const children: Node[] = Array.from(element.childNodes);
		const hasBlockChildren: boolean = children.some(
			(c: Node) => c.nodeType === Node.ELEMENT_NODE && this.isBlockElement(c as HTMLElement),
		);

		if (hasBlockChildren) {
			const innerBlocks: SliceBlock[] = this.parseContainer(element as HTMLElement);
			return innerBlocks.map(
				(b: SliceBlock): SliceBlock => ({
					type: blockType,
					segments: b.segments,
				}),
			);
		}

		return [
			{
				type: blockType,
				segments: this.ensureSegments(this.parseInlineChildren(element, [])),
			},
		];
	}

	private parseList(element: HTMLElement, listType: string, depth: number): SliceBlock[] {
		const blocks: SliceBlock[] = [];

		for (const child of Array.from(element.children)) {
			const el: HTMLElement = child as HTMLElement;
			if (el.tagName === 'LI') {
				blocks.push(...this.parseListItem(el, listType, depth));
			} else if (el.tagName === 'UL') {
				blocks.push(...this.parseList(el, 'bullet', depth + 1));
			} else if (el.tagName === 'OL') {
				blocks.push(...this.parseList(el, 'ordered', depth + 1));
			}
		}

		return blocks;
	}

	private parseListItem(element: HTMLElement, listType: string, depth: number): SliceBlock[] {
		const blocks: SliceBlock[] = [];
		const blockType: NodeTypeName = this.resolveBlockType(nodeType('list_item'));

		const isChecklist: boolean = this.hasCheckbox(element);
		const resolvedListType: string = isChecklist ? 'checklist' : listType;
		const checked: boolean = isChecklist ? this.isCheckboxChecked(element) : false;

		const inlineSegments: TextSegment[] = [];
		const nestedLists: HTMLElement[] = [];

		for (const child of Array.from(element.childNodes)) {
			if (child.nodeType === Node.ELEMENT_NODE) {
				const el: HTMLElement = child as HTMLElement;
				if (el.tagName === 'UL' || el.tagName === 'OL') {
					nestedLists.push(el);
				} else if (el.tagName === 'INPUT' && el.getAttribute('type') === 'checkbox') {
					// skip checkbox inputs — handled via block attributes
				} else if (this.isBlockElement(el)) {
					inlineSegments.push(...this.parseInlineChildren(el, []));
				} else {
					inlineSegments.push(...this.parseInlineNode(child, []));
				}
			} else if (child.nodeType === Node.TEXT_NODE) {
				const text: string = child.textContent ?? '';
				if (text) {
					inlineSegments.push({ text, marks: [] });
				}
			}
		}

		blocks.push({
			type: blockType,
			attrs: {
				listType: resolvedListType,
				indent: depth,
				...(resolvedListType === 'checklist' ? { checked } : {}),
			},
			segments: this.ensureSegments(this.normalizeSegments(inlineSegments)),
		});

		for (const nested of nestedLists) {
			const nestedType: string = nested.tagName === 'OL' ? 'ordered' : 'bullet';
			blocks.push(...this.parseList(nested, nestedType, depth + 1));
		}

		return blocks;
	}

	private parseInlineChildren(element: HTMLElement, parentMarks: readonly Mark[]): TextSegment[] {
		const segments: TextSegment[] = [];

		for (const child of Array.from(element.childNodes)) {
			segments.push(...this.parseInlineNode(child, parentMarks));
		}

		return this.normalizeSegments(segments);
	}

	private parseInlineNode(node: Node, parentMarks: readonly Mark[]): TextSegment[] {
		if (node.nodeType === Node.TEXT_NODE) {
			const text: string = node.textContent ?? '';
			if (text) {
				return [{ text, marks: this.resolveMarks(parentMarks) }];
			}
			return [];
		}

		if (node.nodeType !== Node.ELEMENT_NODE) return [];

		const el: HTMLElement = node as HTMLElement;
		const tag: string = el.tagName;

		if (tag === 'BR') {
			return [{ text: '\n', marks: this.resolveMarks(parentMarks) }];
		}

		if (this.isBlockElement(el) && !INLINE_ELEMENTS.has(tag)) {
			return this.parseInlineChildren(el, parentMarks);
		}

		const childMarks: readonly Mark[] = this.mergeMarks(parentMarks, this.marksFromElement(el));
		return this.parseInlineChildren(el, childMarks);
	}

	private parsePreContent(element: HTMLElement): TextSegment[] {
		const text: string = element.textContent ?? '';
		if (!text) return [];
		return [{ text, marks: [] }];
	}

	private parseTableAsParagraphs(element: HTMLElement): SliceBlock[] {
		const blocks: SliceBlock[] = [];
		const cells: NodeListOf<HTMLTableCellElement> = element.querySelectorAll('td, th');

		for (const cell of Array.from(cells)) {
			const segments: TextSegment[] = this.parseInlineChildren(cell, []);
			if (segments.length > 0 && segments.some((s: TextSegment) => s.text.length > 0)) {
				blocks.push({
					type: this.resolveBlockType(nodeType('paragraph')),
					segments: this.ensureSegments(segments),
				});
			}
		}

		return blocks;
	}

	private marksFromElement(element: HTMLElement): readonly Mark[] {
		const registryMarks: readonly Mark[] | null = this.matchMarkRules(element);
		if (registryMarks) return registryMarks;

		return this.fallbackMarksFromElement(element);
	}

	private matchMarkRules(element: HTMLElement): readonly Mark[] | null {
		if (this.markParseRules.length === 0) return null;

		const tag: string = element.tagName.toLowerCase();
		const marks: Mark[] = [];
		const matchedTypes = new Set<string>();

		for (const entry of this.markParseRules) {
			if (entry.rule.tag !== tag) continue;
			if (matchedTypes.has(entry.type)) continue;

			if (entry.rule.getAttrs) {
				const attrs = entry.rule.getAttrs(element);
				if (attrs === false) continue;
				marks.push({
					type: markType(entry.type),
					...(Object.keys(attrs).length > 0 ? { attrs } : {}),
				} as Mark);
			} else {
				marks.push({ type: markType(entry.type) });
			}
			matchedTypes.add(entry.type);
		}

		return matchedTypes.size > 0 ? marks : null;
	}

	private fallbackMarksFromElement(element: HTMLElement): readonly Mark[] {
		const def: FallbackMarkDef | undefined = FALLBACK_MARK_MAP.get(element.tagName);
		if (!def) return [];

		if (def.getAttrs) {
			const attrs = def.getAttrs(element);
			if (attrs === false) return [];
			return Object.keys(attrs).length > 0
				? [{ type: markType(def.markName), attrs } as Mark]
				: [{ type: markType(def.markName) }];
		}

		return [{ type: markType(def.markName) }];
	}

	private mergeMarks(existing: readonly Mark[], additional: readonly Mark[]): readonly Mark[] {
		const result: Mark[] = [...existing];
		for (const mark of additional) {
			if (!result.some((m: Mark) => m.type === mark.type)) {
				result.push(mark);
			}
		}
		return result;
	}

	private resolveMarks(rawMarks: readonly Mark[]): readonly Mark[] {
		return rawMarks.filter((m: Mark) => isMarkAllowed(this.schema, m.type));
	}

	private resolveBlockType(type: NodeTypeName): NodeTypeName {
		if (isNodeTypeAllowed(this.schema, type)) return type;
		return nodeType('paragraph');
	}

	private normalizeSegments(segments: readonly TextSegment[]): TextSegment[] {
		if (segments.length === 0) return [];

		const result: TextSegment[] = [];
		for (const segment of segments) {
			const prev: TextSegment | undefined = result[result.length - 1];
			if (prev && markSetsEqual(prev.marks, segment.marks)) {
				result[result.length - 1] = {
					text: prev.text + segment.text,
					marks: prev.marks,
				};
			} else if (segment.text.length > 0) {
				result.push(segment);
			}
		}
		return result;
	}

	private ensureSegments(segments: readonly TextSegment[]): readonly TextSegment[] {
		if (segments.length === 0) return [{ text: '', marks: [] }];
		return segments;
	}

	private matchBlockRule(el: HTMLElement): {
		readonly type: NodeTypeName;
		readonly attrs?: Record<string, string | number | boolean>;
	} | null {
		const tag: string = el.tagName.toLowerCase();
		for (const entry of this.blockParseRules) {
			if (entry.rule.tag !== tag) continue;
			if (entry.rule.getAttrs) {
				const attrs = entry.rule.getAttrs(el);
				if (attrs === false) continue;
				return {
					type: nodeType(entry.type),
					attrs: attrs as Record<string, string | number | boolean>,
				};
			}
			return { type: nodeType(entry.type) };
		}
		return null;
	}

	private isBlockElement(el: HTMLElement): boolean {
		if (BLOCK_ELEMENTS.has(el.tagName)) return true;
		const tag: string = el.tagName.toLowerCase();
		return this.blockParseRules.some((entry) => entry.rule.tag === tag);
	}

	private hasCheckbox(element: HTMLElement): boolean {
		const input: HTMLInputElement | null = element.querySelector('input[type="checkbox"]');
		return input !== null;
	}

	private isCheckboxChecked(element: HTMLElement): boolean {
		const input: HTMLInputElement | null = element.querySelector('input[type="checkbox"]');
		return input?.hasAttribute('checked') ?? false;
	}

	/** Checks whether an element contains any block-level descendants. */
	private containsBlockDescendants(el: HTMLElement): boolean {
		for (const child of Array.from(el.children)) {
			if (this.isBlockElement(child as HTMLElement)) return true;
			if (this.containsBlockDescendants(child as HTMLElement)) {
				return true;
			}
		}
		return false;
	}

	/** Parses a container element, prepending inherited marks. */
	private parseContainerWithMarks(
		container: HTMLElement,
		inheritedMarks: readonly Mark[],
	): SliceBlock[] {
		const innerBlocks: SliceBlock[] = this.parseContainer(container);
		if (inheritedMarks.length === 0) return innerBlocks;

		return innerBlocks.map(
			(block: SliceBlock): SliceBlock => ({
				...block,
				segments: this.prependMarks(block.segments, inheritedMarks),
			}),
		);
	}

	/** Merges inherited marks into each segment's mark list. */
	private prependMarks(
		segments: readonly TextSegment[],
		marks: readonly Mark[],
	): readonly TextSegment[] {
		return segments.map(
			(s: TextSegment): TextSegment => ({
				text: s.text,
				marks: this.mergeMarks(marks, s.marks),
			}),
		);
	}

	/**
	 * Parses a block element, splitting into multiple blocks
	 * at `<br>` boundaries.
	 */
	private parseBlockWithLineBreaks(element: HTMLElement, blockType: NodeTypeName): SliceBlock[] {
		const segments: readonly TextSegment[] = this.parseInlineChildren(element, []);
		const hasLineBreak: boolean = segments.some((s: TextSegment) => s.text.includes('\n'));

		if (!hasLineBreak) {
			return [
				{
					type: blockType,
					segments: this.ensureSegments(segments),
				},
			];
		}

		const blocks: SliceBlock[] = [];
		let current: TextSegment[] = [];

		for (const segment of segments) {
			const parts: readonly string[] = segment.text.split('\n');
			for (let i = 0; i < parts.length; i++) {
				if (i > 0) {
					blocks.push({
						type: blockType,
						segments: this.ensureSegments(this.normalizeSegments(current)),
					});
					current = [];
				}
				const part: string = parts[i] ?? '';
				if (part) {
					current.push({ text: part, marks: segment.marks });
				}
			}
		}

		blocks.push({
			type: blockType,
			segments: this.ensureSegments(this.normalizeSegments(current)),
		});

		return blocks;
	}

	private flushPendingSegments(blocks: SliceBlock[], segments: TextSegment[]): void {
		const normalized: TextSegment[] = this.normalizeSegments(segments);
		if (normalized.length === 0) return;
		if (normalized.every((s: TextSegment) => s.text.trim() === '')) return;

		blocks.push({
			type: this.resolveBlockType(nodeType('paragraph')),
			segments: normalized,
		});
	}
}
