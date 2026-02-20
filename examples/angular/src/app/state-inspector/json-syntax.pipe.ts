import { Pipe, type PipeTransform } from '@angular/core';

/**
 * Transforms a JSON string into syntax-highlighted HTML.
 *
 * Escapes HTML entities first to prevent XSS, then wraps tokens
 * in `<span>` elements with CSS classes for styling.
 */
@Pipe({ name: 'jsonSyntax', pure: true })
export class JsonSyntaxPipe implements PipeTransform {
	transform(json: string): string {
		const escaped = json
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

		return escaped.replace(
			/("(?:\\.|[^"\\])*")\s*(:)?|\b(true|false)\b|\b(null)\b|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g,
			(_match, str: string | undefined, colon: string | undefined, bool: string | undefined, nil: string | undefined, num: string | undefined) => {
				if (str) {
					return colon
						? `<span class="json-key">${str}</span>:`
						: `<span class="json-string">${str}</span>`;
				}
				if (bool) return `<span class="json-boolean">${bool}</span>`;
				if (nil) return `<span class="json-null">${nil}</span>`;
				if (num) return `<span class="json-number">${num}</span>`;
				return _match;
			},
		);
	}
}
