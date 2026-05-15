import { describe, expect, it } from 'vitest';
import type { BlockNode } from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { blockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { stateBuilder } from '../../test/TestUtils.js';
import {
	type PairAction,
	type ResolvePairContext,
	type TokenLookup,
	resolvePairAction,
	wrapSelectionPlan,
} from './BracketPairing.js';
import type { ResolvedPairingConfig, SyntaxToken } from './CodeBlockTypes.js';
import { PairStack } from './PairStack.js';

const B1 = blockId('b1');

// --- Test helpers ---

const DEFAULT_PAIRING: ResolvedPairingConfig = {
	brackets: 'languageDefined',
	quotes: 'languageDefined',
	overtype: true,
	deletePair: true,
	surround: 'languageDefined',
};

function makeCodeBlock(text: string, cursor: number, lang = 'typescript') {
	return stateBuilder()
		.block('code_block', text, 'b1', { attrs: { language: lang } })
		.cursor('b1', cursor)
		.schema(['paragraph', 'code_block'], [])
		.build();
}

function makeCodeBlockSel(text: string, anchor: number, head: number, lang = 'typescript') {
	return stateBuilder()
		.block('code_block', text, 'b1', { attrs: { language: lang } })
		.selection({ blockId: 'b1', offset: anchor }, { blockId: 'b1', offset: head })
		.schema(['paragraph', 'code_block'], [])
		.build();
}

function ctxFor(
	state: EditorState,
	char: string,
	options?: {
		config?: Partial<ResolvedPairingConfig>;
		stack?: PairStack;
		token?: SyntaxToken;
	},
): ResolvePairContext {
	const block = state.getBlock(B1) as BlockNode;
	const pairStack = options?.stack ?? new PairStack();
	const lookup: TokenLookup = (_bid, _off) => options?.token;
	return {
		state,
		block,
		blockId: B1,
		char,
		config: { ...DEFAULT_PAIRING, ...options?.config },
		pairStack,
		getTokenAt: lookup,
	};
}

describe('resolvePairAction', () => {
	describe('open brackets — collapsed cursor', () => {
		it('pairs `(` at empty cursor', () => {
			const state = makeCodeBlock('', 0);
			const action: PairAction = resolvePairAction(ctxFor(state, '('));
			expect(action).toEqual({ kind: 'pair', close: ')' });
		});

		it('pairs `[`', () => {
			const state = makeCodeBlock('', 0);
			expect(resolvePairAction(ctxFor(state, '['))).toEqual({ kind: 'pair', close: ']' });
		});

		it('pairs `{`', () => {
			const state = makeCodeBlock('', 0);
			expect(resolvePairAction(ctxFor(state, '{'))).toEqual({ kind: 'pair', close: '}' });
		});

		it('pairs `{` in `languageDefined` mode even inside a string token', () => {
			const state = makeCodeBlock('"a"', 1);
			const action = resolvePairAction(
				ctxFor(state, '{', { token: { from: 0, to: 3, type: 'string' } }),
			);
			expect(action).toEqual({ kind: 'pair', close: '}' });
		});

		it('respects `brackets: never`', () => {
			const state = makeCodeBlock('', 0);
			const action = resolvePairAction(ctxFor(state, '(', { config: { brackets: 'never' } }));
			expect(action.kind).toBe('passthrough');
		});

		it('beforeWhitespace mode: pairs at EOF', () => {
			const state = makeCodeBlock('abc', 3);
			const action = resolvePairAction(
				ctxFor(state, '(', { config: { brackets: 'beforeWhitespace' } }),
			);
			expect(action).toEqual({ kind: 'pair', close: ')' });
		});

		it('beforeWhitespace mode: pairs before whitespace', () => {
			const state = makeCodeBlock('abc def', 3);
			const action = resolvePairAction(
				ctxFor(state, '(', { config: { brackets: 'beforeWhitespace' } }),
			);
			expect(action).toEqual({ kind: 'pair', close: ')' });
		});

		it('beforeWhitespace mode: does not pair before a word char', () => {
			const state = makeCodeBlock('abcdef', 3);
			const action = resolvePairAction(
				ctxFor(state, '(', { config: { brackets: 'beforeWhitespace' } }),
			);
			expect(action.kind).toBe('passthrough');
		});

		it('beforeWhitespace mode: pairs before close brackets', () => {
			const state = makeCodeBlock(')', 0);
			const action = resolvePairAction(
				ctxFor(state, '(', { config: { brackets: 'beforeWhitespace' } }),
			);
			expect(action).toEqual({ kind: 'pair', close: ')' });
		});
	});

	describe('quotes', () => {
		it('pairs " in code context', () => {
			const state = makeCodeBlock('abc', 3);
			const action = resolvePairAction(ctxFor(state, '"'));
			expect(action).toEqual({ kind: 'pair', close: '"' });
		});

		it('pairs ` in code context', () => {
			const state = makeCodeBlock('abc', 3);
			const action = resolvePairAction(ctxFor(state, '`'));
			expect(action).toEqual({ kind: 'pair', close: '`' });
		});

		it("does NOT pair ' after a word char (apostrophe context)", () => {
			const state = makeCodeBlock('don', 3);
			const action = resolvePairAction(ctxFor(state, "'"));
			expect(action.kind).toBe('passthrough');
		});

		it("pairs ' after whitespace", () => {
			const state = makeCodeBlock('abc ', 4);
			const action = resolvePairAction(ctxFor(state, "'"));
			expect(action).toEqual({ kind: 'pair', close: "'" });
		});

		it("pairs ' at start of line", () => {
			const state = makeCodeBlock('', 0);
			const action = resolvePairAction(ctxFor(state, "'"));
			expect(action).toEqual({ kind: 'pair', close: "'" });
		});

		it("does NOT pair ' inside a string token (languageDefined)", () => {
			const state = makeCodeBlock(' ', 1);
			const action = resolvePairAction(
				ctxFor(state, '"', { token: { from: 0, to: 1, type: 'string' } }),
			);
			expect(action.kind).toBe('passthrough');
		});

		it('does NOT pair " inside a comment token', () => {
			const state = makeCodeBlock('   ', 1);
			const action = resolvePairAction(
				ctxFor(state, '"', { token: { from: 0, to: 3, type: 'comment' } }),
			);
			expect(action.kind).toBe('passthrough');
		});

		it('respects quotes: never', () => {
			const state = makeCodeBlock('', 0);
			const action = resolvePairAction(ctxFor(state, '"', { config: { quotes: 'never' } }));
			expect(action.kind).toBe('passthrough');
		});

		it('quotes always-mode bypasses string-token suppression', () => {
			const state = makeCodeBlock(' ', 1);
			const action = resolvePairAction(
				ctxFor(state, '"', {
					config: { quotes: 'always' },
					token: { from: 0, to: 1, type: 'string' },
				}),
			);
			expect(action).toEqual({ kind: 'pair', close: '"' });
		});
	});

	describe('overtype', () => {
		it('returns overtype when next char is auto-paired close', () => {
			const state = makeCodeBlock('()', 1);
			const stack = new PairStack();
			stack.push(PairStack.makePos(B1, 1), ')');
			const action = resolvePairAction(ctxFor(state, ')', { stack }));
			expect(action).toEqual({ kind: 'overtype' });
		});

		it('does NOT overtype if the next ) was user-typed', () => {
			const state = makeCodeBlock('()', 1);
			const action = resolvePairAction(ctxFor(state, ')'));
			expect(action.kind).toBe('passthrough');
		});

		it('disables overtype with config.overtype=false', () => {
			const state = makeCodeBlock('()', 1);
			const stack = new PairStack();
			stack.push(PairStack.makePos(B1, 1), ')');
			const action = resolvePairAction(ctxFor(state, ')', { config: { overtype: false }, stack }));
			expect(action.kind).toBe('passthrough');
		});

		it('overtypes a tracked quote', () => {
			const state = makeCodeBlock('""', 1);
			const stack = new PairStack();
			stack.push(PairStack.makePos(B1, 1), '"');
			const action = resolvePairAction(ctxFor(state, '"', { stack }));
			expect(action).toEqual({ kind: 'overtype' });
		});
	});

	describe('wrap-selection', () => {
		it('wraps a range selection with brackets', () => {
			const state = makeCodeBlockSel('abc', 0, 3);
			const action = resolvePairAction(ctxFor(state, '('));
			expect(action).toEqual({ kind: 'wrap', open: '(', close: ')' });
		});

		it('wraps with quotes when surround=languageDefined', () => {
			const state = makeCodeBlockSel('abc', 0, 3);
			const action = resolvePairAction(ctxFor(state, '"'));
			expect(action).toEqual({ kind: 'wrap', open: '"', close: '"' });
		});

		it('respects surround=brackets (wraps brackets, passthrough on quotes)', () => {
			const state = makeCodeBlockSel('abc', 0, 3);
			expect(resolvePairAction(ctxFor(state, '(', { config: { surround: 'brackets' } }))).toEqual({
				kind: 'wrap',
				open: '(',
				close: ')',
			});
			expect(resolvePairAction(ctxFor(state, '"', { config: { surround: 'brackets' } })).kind).toBe(
				'passthrough',
			);
		});

		it('respects surround=quotes (passthrough on brackets)', () => {
			const state = makeCodeBlockSel('abc', 0, 3);
			expect(resolvePairAction(ctxFor(state, '(', { config: { surround: 'quotes' } })).kind).toBe(
				'passthrough',
			);
		});

		it('respects surround=never', () => {
			const state = makeCodeBlockSel('abc', 0, 3);
			expect(resolvePairAction(ctxFor(state, '"', { config: { surround: 'never' } })).kind).toBe(
				'passthrough',
			);
		});

		it('wrap wins over string-token suppression', () => {
			const state = makeCodeBlockSel('abc', 0, 3);
			const action = resolvePairAction(
				ctxFor(state, '"', { token: { from: 0, to: 3, type: 'string' } }),
			);
			expect(action.kind).toBe('wrap');
		});
	});

	describe('passthrough', () => {
		it('passthrough for non-pair chars', () => {
			const state = makeCodeBlock('', 0);
			expect(resolvePairAction(ctxFor(state, 'a')).kind).toBe('passthrough');
		});

		it('passthrough for typed close char with no preceding match', () => {
			const state = makeCodeBlock('abc', 3);
			expect(resolvePairAction(ctxFor(state, ')')).kind).toBe('passthrough');
		});
	});
});

describe('wrapSelectionPlan', () => {
	it('returns ascending offsets for forward selection', () => {
		const sel = createSelection({ blockId: B1, offset: 2 }, { blockId: B1, offset: 5 });
		const plan = wrapSelectionPlan(sel, [B1]);
		expect(plan).toEqual({ fromOffset: 2, toOffset: 5 });
	});

	it('returns ascending offsets for backward selection', () => {
		const sel = createSelection({ blockId: B1, offset: 7 }, { blockId: B1, offset: 3 });
		const plan = wrapSelectionPlan(sel, [B1]);
		expect(plan).toEqual({ fromOffset: 3, toOffset: 7 });
	});

	it('handles collapsed selections', () => {
		const sel = createCollapsedSelection(B1, 4);
		const plan = wrapSelectionPlan(sel, [B1]);
		expect(plan).toEqual({ fromOffset: 4, toOffset: 4 });
	});
});
