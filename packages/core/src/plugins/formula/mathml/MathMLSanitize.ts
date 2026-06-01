/**
 * MathML tag and attribute allowlists for DOMPurify sanitization.
 *
 * Layer A (framework-agnostic, zero notectl imports). These constants feed the
 * `sanitize` config of the formula node specs so pasted/serialized `<math>`
 * survives the editor's additive DOMPurify allowlist.
 *
 * Verified in a real browser (Chromium): passing these as `ALLOWED_TAGS` /
 * `ALLOWED_ATTR` preserves MathML through `DOMPurify.sanitize()`.
 */

/** MathML element names allowed through sanitization. */
export const MATHML_TAGS: readonly string[] = [
	'math',
	'semantics',
	'annotation',
	'annotation-xml',
	'mrow',
	'mi',
	'mn',
	'mo',
	'mtext',
	'ms',
	'mspace',
	'mfrac',
	'msqrt',
	'mroot',
	'msup',
	'msub',
	'msubsup',
	'mover',
	'munder',
	'munderover',
	'mmultiscripts',
	'mprescripts',
	'none',
	'mtable',
	'mtr',
	'mlabeledtr',
	'mtd',
	'mpadded',
	'mphantom',
	'mstyle',
	'merror',
	'menclose',
	'mfenced',
	'maction',
];

/** MathML attributes allowed through sanitization (DOMPurify allows attrs globally). */
export const MATHML_ATTRS: readonly string[] = [
	'display',
	'encoding',
	'mathvariant',
	'mathsize',
	'mathcolor',
	'mathbackground',
	'displaystyle',
	'scriptlevel',
	'scriptminsize',
	'scriptsizemultiplier',
	'stretchy',
	'symmetric',
	'largeop',
	'movablelimits',
	'accent',
	'accentunder',
	'form',
	'fence',
	'separator',
	'lspace',
	'rspace',
	'voffset',
	'minsize',
	'maxsize',
	'linethickness',
	'columnalign',
	'rowalign',
	'columnspacing',
	'rowspacing',
	'columnlines',
	'rowlines',
	'columnspan',
	'rowspan',
	'align',
	'open',
	'close',
	'separators',
	'notation',
	'alttext',
	'depth',
	'width',
	'height',
];
