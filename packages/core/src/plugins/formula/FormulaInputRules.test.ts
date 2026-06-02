import { describe, expect, it } from 'vitest';
import { isNodeSelection } from '../../model/Selection.js';
import type { Transaction } from '../../state/Transaction.js';
import { stateBuilder } from '../../test/TestUtils.js';
import { createFormulaInputRules } from './FormulaInputRules.js';

const [displayRule, inlineRule] = createFormulaInputRules();

interface NodeStep {
	readonly type: string;
	readonly node: {
		readonly type?: string;
		readonly inlineType?: string;
		readonly attrs: Record<string, string>;
	};
}

function run(
	rule: typeof inlineRule,
	text: string,
	cursor: number,
	blockType = 'paragraph',
): Transaction | null {
	const state = stateBuilder()
		.block(blockType, text, 'b1', {})
		.cursor('b1', cursor)
		.schema(['paragraph', 'code_block', 'math_display'], [])
		.build();
	const match = text.match(rule.pattern);
	expect(match, `pattern should match "${text}"`).not.toBeNull();
	return rule.handler(state, match as RegExpMatchArray);
}

describe('formula input rules', () => {
	it('$...$ converts to an inline math node and removes the typed source', () => {
		const tr = run(inlineRule, '$x^2$', 5) as Transaction;
		expect(tr).not.toBeNull();
		const types = tr.steps.map((s) => s.type);
		expect(types).toContain('deleteText');
		expect(types).toContain('insertInlineNode');
		const inserted = tr.steps.find((s) => s.type === 'insertInlineNode') as unknown as NodeStep;
		expect(inserted.node.inlineType).toBe('math_inline');
		expect(inserted.node.attrs.latex).toBe('x^2');
	});

	it('$$...$$ converts to a display block followed by a trailing paragraph', () => {
		const tr = run(displayRule, '$$y$$', 5) as Transaction;
		expect(tr).not.toBeNull();
		const inserts = tr.steps.filter((s) => s.type === 'insertNode') as unknown as NodeStep[];
		// Display block plus a trailing paragraph, so there is always a line after it.
		expect(inserts).toHaveLength(2);
		expect(inserts[0]?.node.type).toBe('math_display');
		expect(inserts[1]?.node.type).toBe('paragraph');
		expect(inserts[0]?.node.attrs.latex).toBe('y');
		expect(isNodeSelection(tr.selectionAfter)).toBe(true);
	});

	it('does not fire inside a code block', () => {
		expect(run(inlineRule, '$x$', 3, 'code_block')).toBeNull();
	});
});
