import { describe, expect, it } from 'vitest';
import { stateBuilder } from '../../test/TestUtils.js';
import { createMarkInputRule } from './MarkInputRule.js';

/** Runs a wrapping-mark rule against `text` typed in a single paragraph. */
function applyRule(markName: string, delimiter: string, text: string) {
	const rule = createMarkInputRule(markName, delimiter);
	const state = stateBuilder()
		.paragraph(text, 'b1')
		.cursor('b1', text.length)
		.schema(['paragraph', 'code_block'], [markName])
		.build();
	const match = text.match(rule.pattern);
	if (!match) return { matched: false, tr: null };
	const tr = rule.handler(state, match, match.index ?? 0, (match.index ?? 0) + match[0].length);
	return { matched: true, tr };
}

describe('createMarkInputRule', () => {
	it('wraps **x** in bold and consumes the delimiters', () => {
		const { matched, tr } = applyRule('bold', '**', '**hello**');
		expect(matched).toBe(true);
		expect(tr).not.toBeNull();
		const insert = tr?.steps.find((s) => s.type === 'insertText');
		expect(insert).toBeDefined();
		const hasBold = tr?.steps.some(
			(s) => s.type === 'insertText' && s.marks.some((m) => m.type === 'bold'),
		);
		expect(hasBold).toBe(true);
	});

	it('wraps ~~x~~ in strikethrough', () => {
		const { tr } = applyRule('strikethrough', '~~', '~~gone~~');
		const hasStrike = tr?.steps.some(
			(s) => s.type === 'insertText' && s.marks.some((m) => m.type === 'strikethrough'),
		);
		expect(hasStrike).toBe(true);
	});

	it('italic *x* does not fire inside bold **x**', () => {
		// The italic rule must not match the trailing `**` of a bold expression.
		const rule = createMarkInputRule('italic', '*');
		expect('**hello**'.match(rule.pattern)).toBeNull();
	});

	it('does not match empty delimiters', () => {
		const rule = createMarkInputRule('bold', '**');
		expect('****'.match(rule.pattern)).toBeNull();
	});

	it('returns null inside a code_block', () => {
		const rule = createMarkInputRule('bold', '**');
		const state = stateBuilder()
			.block('code_block', '**x**', 'cb1')
			.cursor('cb1', 5)
			.schema(['paragraph', 'code_block'], ['bold'])
			.build();
		const match = '**x**'.match(rule.pattern);
		expect(match).not.toBeNull();
		if (!match) return;
		const tr = rule.handler(state, match, match.index ?? 0, (match.index ?? 0) + match[0].length);
		expect(tr).toBeNull();
	});
});
