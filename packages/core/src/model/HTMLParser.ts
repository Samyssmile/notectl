/**
 * HTMLParser: converts sanitized HTML DOM into a ContentSlice.
 * Works on DOM nodes (not strings), is schema-aware, and produces immutable output.
 */

import type { ContentSlice, SliceBlock } from './ContentSlice.js';
import type { Mark, TextSegment } from './Document.js';
import { markSetsEqual } from './Document.js';
import type { Schema } from './Schema.js';
import { isMarkAllowed, isNodeTypeAllowed } from './Schema.js';
import type { NodeTypeName } from './TypeBrands.js';
import { markType, nodeType } from './TypeBrands.js';

export interface HTMLParserOptions {
	readonly schema: Schema;
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

export class HTMLParser {
	private readonly schema: Schema;

	constructor(options: HTMLParserOptions) {
		this.schema = options.schema;
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
		const tag: string = element.tagName;

		const headingMatch: RegExpExecArray | null = /^H([1-6])$/.exec(tag);
		if (headingMatch) {
			const level: number = Number(headingMatch[1]);
			const blockType: NodeTypeName = this.resolveBlockType(nodeType('heading'));
			return [
				{
					type: blockType,
					...(blockType === nodeType('heading') ? { attrs: { level } } : {}),
					segments: this.ensureSegments(this.parseInlineChildren(element, [])),
				},
			];
		}

		switch (tag) {
			case 'P':
			case 'DIV':
				return [
					{
						type: this.resolveBlockType(nodeType('paragraph')),
						segments: this.ensureSegments(this.parseInlineChildren(element, [])),
					},
				];

			case 'BLOCKQUOTE':
				return this.parseBlockquote(element);

			case 'UL':
				return this.parseList(element, 'bullet', 0);

			case 'OL':
				return this.parseList(element, 'ordered', 0);

			case 'LI':
				return this.parseListItem(element, 'bullet', 0);

			case 'HR':
				return [
					{
						type: this.resolveBlockType(nodeType('horizontal_rule')),
						segments: [],
					},
				];

			case 'PRE':
				return [
					{
						type: this.resolveBlockType(nodeType('paragraph')),
						segments: this.ensureSegments(this.parsePreContent(element)),
					},
				];

			case 'TABLE':
			case 'THEAD':
			case 'TBODY':
			case 'TR':
				return this.parseTableAsParagraphs(element);

			default:
				return [
					{
						type: this.resolveBlockType(nodeType('paragraph')),
						segments: this.ensureSegments(this.parseInlineChildren(element, [])),
					},
				];
		}
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
		const marks: Mark[] = [];
		const tag: string = element.tagName;

		if (tag === 'STRONG' || tag === 'B') {
			marks.push({ type: markType('bold') });
		}
		if (tag === 'EM' || tag === 'I') {
			marks.push({ type: markType('italic') });
		}
		if (tag === 'U') {
			marks.push({ type: markType('underline') });
		}
		if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') {
			marks.push({ type: markType('strikethrough') });
		}
		if (tag === 'A') {
			const href: string = element.getAttribute('href') ?? '';
			marks.push({ type: markType('link'), attrs: { href } });
		}

		return marks;
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
				result[result.length - 1] = { text: prev.text + segment.text, marks: prev.marks };
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

	private isBlockElement(el: HTMLElement): boolean {
		return BLOCK_ELEMENTS.has(el.tagName);
	}

	private hasCheckbox(element: HTMLElement): boolean {
		const input: HTMLInputElement | null = element.querySelector('input[type="checkbox"]');
		return input !== null;
	}

	private isCheckboxChecked(element: HTMLElement): boolean {
		const input: HTMLInputElement | null = element.querySelector('input[type="checkbox"]');
		return input?.hasAttribute('checked') ?? false;
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
