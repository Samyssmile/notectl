/**
 * Minimal HTML-only schema for Markdown's raw-HTML seam.
 *
 * Registry-free Markdown calls still need the portable structures owned by the
 * codec when a block must become raw HTML (for example to retain an `htmlId`).
 * An explicitly supplied registry is returned unchanged and remains the sole
 * authority. No plugin or view module is imported here.
 */

import { escapeAttr, sanitizeHref } from '../../model/HTMLUtils.js';
import { SchemaRegistry } from '../../model/SchemaRegistry.js';

let baselineRegistry: SchemaRegistry | undefined;

/** Resolves the schema at an HTML boundary without supplementing an explicit schema. */
export function resolveMarkdownHTMLRegistry(registry?: SchemaRegistry): SchemaRegistry {
	if (registry) return registry;
	baselineRegistry ??= createBaselineRegistry();
	return baselineRegistry;
}

function htmlOnlyDOM(): HTMLElement {
	throw new Error('The Markdown HTML registry cannot render editor DOM.');
}

function createBaselineRegistry(): SchemaRegistry {
	const registry = new SchemaRegistry();
	registerBlocks(registry);
	registerMarks(registry);
	registerInlineNodes(registry);
	return registry;
}

function registerBlocks(registry: SchemaRegistry): void {
	registry.registerNodeSpec({
		type: 'paragraph',
		toDOM: htmlOnlyDOM,
		toHTML: (_node, content) => `<p>${content || '<br>'}</p>`,
		parseHTML: [{ tag: 'p' }, { tag: 'div', priority: 10 }],
		sanitize: { tags: ['p'] },
	});

	registry.registerNodeSpec({
		type: 'heading',
		toDOM: htmlOnlyDOM,
		toHTML(node, content) {
			const raw: unknown = node.attrs?.level;
			const level: number =
				typeof raw === 'number' && Number.isFinite(raw)
					? Math.max(1, Math.min(6, Math.floor(raw)))
					: 1;
			return `<h${level}>${content || '<br>'}</h${level}>`;
		},
		parseHTML: [1, 2, 3, 4, 5, 6].map((level) => ({
			tag: `h${level}`,
			getAttrs: () => ({ level }),
		})),
		sanitize: { tags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
	});

	registry.registerNodeSpec({
		type: 'list_item',
		toDOM: htmlOnlyDOM,
		toHTML(node, content) {
			if (node.attrs?.listType !== 'checklist') return `<li>${content || '<br>'}</li>`;
			const checked: boolean = node.attrs.checked === true;
			return (
				`<li role="checkbox" aria-checked="${String(checked)}">` +
				`<input type="checkbox" disabled${checked ? ' checked' : ''}>` +
				`${content || '<br>'}</li>`
			);
		},
		parseHTML: [{ tag: 'li' }],
		sanitize: {
			tags: ['ul', 'ol', 'li', 'input'],
			attrs: ['type', 'disabled', 'checked', 'role', 'aria-checked'],
		},
	});

	registry.registerNodeSpec({
		type: 'blockquote',
		toDOM: htmlOnlyDOM,
		toHTML: (_node, content) => `<blockquote>${content || '<br>'}</blockquote>`,
		parseHTML: [{ tag: 'blockquote' }],
		sanitize: { tags: ['blockquote'] },
	});

	registry.registerNodeSpec({
		type: 'code_block',
		toDOM: htmlOnlyDOM,
		toHTML(node, content) {
			const language: string = String(node.attrs?.language ?? '');
			const languageClass: string = language ? ` class="language-${escapeAttr(language)}"` : '';
			return `<pre><code${languageClass}>${content}</code></pre>`;
		},
		parseHTML: [
			{
				tag: 'pre',
				getAttrs(el) {
					const code: HTMLElement | null = el.querySelector('code');
					const language: string = code?.className.match(/(?:^|\s)language-(\S+)/)?.[1] ?? '';
					return { language };
				},
			},
		],
		sanitize: { tags: ['pre', 'code'], attrs: ['class'] },
	});

	registry.registerNodeSpec({
		type: 'horizontal_rule',
		isVoid: true,
		toDOM: htmlOnlyDOM,
		toHTML: () => '<hr>',
		parseHTML: [{ tag: 'hr' }],
		sanitize: { tags: ['hr'] },
	});

	registry.registerNodeSpec({
		type: 'image',
		isVoid: true,
		attrs: {
			src: { default: '' },
			alt: { default: '' },
			title: { default: '' },
			align: { default: 'center' },
		},
		toDOM: htmlOnlyDOM,
		toHTML(node) {
			const src: string = escapeAttr(String(node.attrs?.src ?? ''));
			const alt: string = escapeAttr(String(node.attrs?.alt ?? ''));
			const title: string = String(node.attrs?.title ?? '');
			const titleAttr: string = title ? ` title="${escapeAttr(title)}"` : '';
			const dimension = (name: string, value: unknown): string =>
				typeof value === 'number' && Number.isFinite(value) && value > 0
					? ` ${name}="${String(value)}"`
					: '';
			return (
				`<figure><img src="${src}" alt="${alt}"${titleAttr}` +
				`${dimension('width', node.attrs?.width)}${dimension('height', node.attrs?.height)}></figure>`
			);
		},
		parseHTML: [
			{
				tag: 'figure',
				getAttrs(el) {
					const image: HTMLImageElement | null = el.querySelector('img');
					return image ? imageAttrs(image) : false;
				},
			},
			{ tag: 'img', getAttrs: (el) => imageAttrs(el as HTMLImageElement) },
		],
		sanitize: {
			tags: ['figure', 'img'],
			attrs: ['src', 'alt', 'title', 'width', 'height'],
		},
	});

	registry.registerNodeSpec({
		type: 'table',
		toDOM: htmlOnlyDOM,
		toHTML: (_node, content) => `<table>${content}</table>`,
		sanitize: { tags: ['table', 'thead', 'tbody', 'tfoot'] },
	});

	registry.registerNodeSpec({
		type: 'table_row',
		toDOM: htmlOnlyDOM,
		toHTML: (_node, content) => `<tr>${content}</tr>`,
		sanitize: { tags: ['tr'] },
	});

	registry.registerNodeSpec({
		type: 'table_cell',
		toDOM: htmlOnlyDOM,
		toHTML(node, content) {
			const span = (name: string, value: unknown): string =>
				typeof value === 'number' && Number.isInteger(value) && value > 1
					? ` ${name}="${String(value)}"`
					: '';
			return `<td${span('colspan', node.attrs?.colspan)}${span(
				'rowspan',
				node.attrs?.rowspan,
			)}>${content}</td>`;
		},
		sanitize: { tags: ['td', 'th'], attrs: ['colspan', 'rowspan'] },
	});
}

function imageAttrs(image: HTMLImageElement): Record<string, string | number | boolean> {
	const attrs: Record<string, string | number | boolean> = {
		...inlineImageAttrs(image),
		align: 'center',
	};
	for (const name of ['width', 'height'] as const) {
		const value: number = Number.parseFloat(image.getAttribute(name) ?? '');
		if (Number.isFinite(value) && value > 0) attrs[name] = value;
	}
	return attrs;
}

function inlineImageAttrs(image: HTMLImageElement): Record<string, string> {
	const attrs: Record<string, string> = {
		src: image.getAttribute('src') ?? '',
		alt: image.getAttribute('alt') ?? '',
	};
	const title: string | null = image.getAttribute('title');
	if (title) attrs.title = title;
	return attrs;
}

function registerMarks(registry: SchemaRegistry): void {
	const tagMarks: readonly {
		readonly type: string;
		readonly rank: number;
		readonly tag: string;
		readonly parseTags: readonly string[];
	}[] = [
		{ type: 'bold', rank: 0, tag: 'strong', parseTags: ['strong', 'b'] },
		{ type: 'italic', rank: 1, tag: 'em', parseTags: ['em', 'i'] },
		{ type: 'underline', rank: 2, tag: 'u', parseTags: ['u'] },
		{ type: 'code', rank: 3, tag: 'code', parseTags: ['code'] },
		{ type: 'strikethrough', rank: 4, tag: 's', parseTags: ['s', 'strike', 'del'] },
	];

	for (const mark of tagMarks) {
		registry.registerMarkSpec({
			type: mark.type,
			rank: mark.rank,
			toDOM: htmlOnlyDOM,
			toHTMLString: (_value, content) => `<${mark.tag}>${content}</${mark.tag}>`,
			parseHTML: mark.parseTags.map((tag) => ({
				tag,
				getAttrs:
					tag === 'code' ? (el) => (el.parentElement?.tagName === 'PRE' ? false : {}) : undefined,
			})),
			sanitize: { tags: mark.parseTags },
		});
	}

	registry.registerMarkSpec({
		type: 'link',
		rank: 10,
		toDOM: htmlOnlyDOM,
		toHTMLString(mark, content) {
			const href: string = escapeAttr(sanitizeHref(String(mark.attrs?.href ?? '')));
			const title: string = String(mark.attrs?.title ?? '');
			const titleAttr: string = title ? ` title="${escapeAttr(title)}"` : '';
			return `<a href="${href}"${titleAttr}>${content}</a>`;
		},
		parseHTML: [
			{
				tag: 'a',
				getAttrs(el) {
					const href: string = sanitizeHref(el.getAttribute('href') ?? '');
					const title: string | null = el.getAttribute('title');
					return title ? { href, title } : { href };
				},
			},
		],
		sanitize: { tags: ['a'], attrs: ['href', 'title'] },
	});
}

function registerInlineNodes(registry: SchemaRegistry): void {
	registry.registerInlineNodeSpec({
		type: 'hard_break',
		toDOM: htmlOnlyDOM,
		toHTMLString: () => '<br>',
		parseHTML: [{ tag: 'br' }],
		sanitize: { tags: ['br'] },
	});

	registry.registerInlineNodeSpec({
		type: 'image_inline',
		toDOM: htmlOnlyDOM,
		toHTMLString(node) {
			const src: string = escapeAttr(String(node.attrs.src ?? ''));
			const alt: string = escapeAttr(String(node.attrs.alt ?? ''));
			const title: string = String(node.attrs.title ?? '');
			const titleAttr: string = title ? ` title="${escapeAttr(title)}"` : '';
			return `<img src="${src}" alt="${alt}"${titleAttr}>`;
		},
		parseHTML: [{ tag: 'img', getAttrs: (el) => inlineImageAttrs(el as HTMLImageElement) }],
		sanitize: { tags: ['img'], attrs: ['src', 'alt', 'title'] },
	});
}
