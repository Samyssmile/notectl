/**
 * MarkSpec: defines how an inline mark type renders to the DOM.
 */

import type { MarkAttrsFor } from './AttrRegistry.js';
import type { Mark } from './Document.js';
import type { AttrSpec } from './NodeSpec.js';

export interface MarkSpec<T extends string = string> {
	readonly type: T;
	/** Wraps text content in a DOM element for this mark. */
	toDOM(mark: Omit<Mark, 'attrs'> & { readonly attrs: MarkAttrsFor<T> }): HTMLElement;
	/** Nesting priority — lower rank renders closer to the text content. */
	readonly rank?: number;
	readonly attrs?: Readonly<Record<string, AttrSpec>>;
}
