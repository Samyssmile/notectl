/**
 * Factory for inline marks that carry a single CSS style declaration (text
 * color, highlight, font family, font size). These marks share the same DOM
 * rendering, HTML import/export, and `<span>`-based parse shape and differ only
 * in the attribute name, CSS property, and validation.
 */

import type { Mark } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import type { MarkSpec } from '../../model/MarkSpec.js';
import type { HTMLExportContext } from '../../model/NodeSpec.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';

export interface InlineStyleMarkConfig {
	/** Mark type name, e.g. `'textColor'`. */
	readonly type: string;
	/** Nesting rank (lower renders closer to the text). */
	readonly rank: number;
	/** Attribute key holding the value, e.g. `'color'` / `'family'` / `'size'`. */
	readonly valueAttr: string;
	/** camelCase DOM style property, e.g. `'backgroundColor'`. */
	readonly domStyleProperty: string;
	/** kebab-case CSS property for HTML export, e.g. `'background-color'`. */
	readonly cssProperty: string;
	/** Validates a value for HTML export (and optionally on parse). */
	readonly validate: (value: string) => boolean;
	/** When true, `validate` is also enforced while parsing HTML. */
	readonly validateOnParse?: boolean;
	/** Optional transform applied to a parsed value (e.g. CSS quote normalization). */
	readonly transformParsed?: (value: string) => string;
}

/** Builds a MarkSpec for a single-CSS-property inline mark. */
export function createInlineStyleMarkSpec(config: InlineStyleMarkConfig): MarkSpec {
	const {
		type,
		rank,
		valueAttr,
		domStyleProperty,
		cssProperty,
		validate,
		validateOnParse,
		transformParsed,
	} = config;

	const readValue = (mark: Mark): string => String(mark.attrs?.[valueAttr] ?? '');

	return {
		type,
		rank,
		attrs: { [valueAttr]: { default: '' } },
		toDOM(mark) {
			const span: HTMLElement = document.createElement('span');
			const value: string = readValue(mark);
			if (value) {
				setStyleProperty(span, domStyleProperty, value);
			}
			return span;
		},
		toHTMLString: (mark: Mark, content: string, ctx?: HTMLExportContext) => {
			const value: string = readValue(mark);
			if (!value || !validate(value)) return content;
			const decl: string = `${cssProperty}: ${escapeHTML(value)}`;
			const attr: string = ctx?.styleAttr(decl) ?? ` style="${decl}"`;
			return `<span${attr}>${content}</span>`;
		},
		toHTMLStyle: (mark: Mark) => {
			const value: string = readValue(mark);
			if (!value || !validate(value)) return null;
			return `${cssProperty}: ${escapeHTML(value)}`;
		},
		parseHTML: [
			{
				tag: 'span',
				getAttrs: (el: HTMLElement) => {
					const raw: string =
						(el.style as unknown as Record<string, string>)[domStyleProperty] ?? '';
					if (!raw) return false;
					if (validateOnParse && !validate(raw)) return false;
					const value: string = transformParsed ? transformParsed(raw) : raw;
					return { [valueAttr]: value };
				},
			},
		],
		sanitize: { tags: ['span'] },
	};
}
