/**
 * Normalizes legacy HTML elements to their modern CSS equivalents.
 * Converts {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/font | <font>}
 * `color/face/size` attributes to `<span style="color/font-family/font-size">`
 * so that DOMPurify + existing plugin parse rules handle them transparently.
 *
 * Must be called BEFORE DOMPurify sanitization.
 */

/** Maps HTML `<font size>` values (1–7) to CSS font-size keywords per the HTML 4 spec. */
const FONT_SIZE_MAP: Readonly<Record<string, string>> = {
	'1': 'x-small',
	'2': 'small',
	'3': 'medium',
	'4': 'large',
	'5': 'x-large',
	'6': 'xx-large',
	'7': 'xxx-large',
};

/**
 * Normalizes legacy `<font>` elements in-place, converting them to `<span style="...">`.
 *
 * - `color` attribute → `style.color`
 * - `face` attribute → `style.fontFamily`
 * - `size` attribute → mapped to CSS `font-size` keyword (unless inline `font-size` already set)
 * - `<font>` with no meaningful attributes → unwrapped (children promoted to parent)
 */
export function normalizeLegacyHTML(container: DocumentFragment | HTMLElement): void {
	const fonts: HTMLElement[] = Array.from(container.querySelectorAll('font'));

	for (const font of fonts) {
		const color: string | null = font.getAttribute('color');
		const face: string | null = font.getAttribute('face');
		const size: string | null = font.getAttribute('size');
		const existingStyle: string = font.getAttribute('style') ?? '';

		const hasFormatting: boolean =
			color !== null || face !== null || size !== null || existingStyle.length > 0;

		if (!hasFormatting) {
			unwrap(font);
			continue;
		}

		const span: HTMLSpanElement = document.createElement('span');
		const styles: string[] = [];

		if (existingStyle) {
			styles.push(existingStyle.endsWith(';') ? existingStyle : `${existingStyle};`);
		}

		if (color) {
			styles.push(`color: ${color};`);
		}

		if (face) {
			styles.push(`font-family: ${face};`);
		}

		if (size && !hasFontSizeInStyle(existingStyle)) {
			const mapped: string | undefined = FONT_SIZE_MAP[size];
			if (mapped) {
				styles.push(`font-size: ${mapped};`);
			}
		}

		span.setAttribute('style', styles.join(' '));

		moveChildren(font, span);
		font.parentNode?.replaceChild(span, font);
	}
}

/** Checks whether an inline style string already contains a `font-size` declaration. */
function hasFontSizeInStyle(style: string): boolean {
	return style.toLowerCase().includes('font-size');
}

/** Moves all child nodes from `source` to `target`. */
function moveChildren(source: Node, target: Node): void {
	while (source.firstChild) {
		target.appendChild(source.firstChild);
	}
}

/** Unwraps an element, promoting its children into its parent. */
function unwrap(element: HTMLElement): void {
	const parent: Node | null = element.parentNode;
	if (!parent) return;

	while (element.firstChild) {
		parent.insertBefore(element.firstChild, element);
	}
	parent.removeChild(element);
}
