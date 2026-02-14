/**
 * Registers built-in node specs on a SchemaRegistry.
 * Called during editor initialization before plugins.
 *
 * Note: Mark specs (bold, italic, underline) are registered by the
 * TextFormattingPlugin, not here. Only structural node types belong here.
 */

import { createBlockElement } from './NodeSpec.js';
import type { SchemaRegistry } from './SchemaRegistry.js';

/** Registers the built-in paragraph NodeSpec. */
export function registerBuiltinSpecs(registry: SchemaRegistry): void {
	registry.registerNodeSpec({
		type: 'paragraph',
		group: 'block',
		content: { allow: ['text'] },
		toDOM(node) {
			return createBlockElement('p', node.id);
		},
		toHTML(_node, content) {
			return `<p>${content || '<br>'}</p>`;
		},
		parseHTML: [{ tag: 'p' }, { tag: 'div', priority: 10 }],
		sanitize: { tags: ['p'] },
	});
}
