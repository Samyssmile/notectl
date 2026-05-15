/**
 * BracketPairing: resolves the action that should be taken when the user
 * types a printable character that could trigger auto-pairing, overtype,
 * surround, or quote suppression inside a code block.
 *
 * The resolver is a pure function — it consumes the current state, the
 * incoming char, a token lookup and the auto-pair stack, and returns a
 * typed action that the keyboard / interceptor layer applies. No DOM, no
 * dispatch.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockText } from '../../model/Document.js';
import {
	type Selection,
	isCollapsed,
	isTextSelection,
	selectionRange,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { ResolvedPairingConfig, SyntaxToken } from './CodeBlockTypes.js';
import type { PairStack } from './PairStack.js';

// --- Pair definitions ---

export interface PairDefinition {
	readonly open: string;
	readonly close: string;
	readonly kind: 'bracket' | 'quote';
}

export const PAIR_DEFINITIONS: readonly PairDefinition[] = [
	{ open: '(', close: ')', kind: 'bracket' },
	{ open: '[', close: ']', kind: 'bracket' },
	{ open: '{', close: '}', kind: 'bracket' },
	{ open: '"', close: '"', kind: 'quote' },
	{ open: "'", close: "'", kind: 'quote' },
	{ open: '`', close: '`', kind: 'quote' },
];

const OPEN_TO_PAIR: ReadonlyMap<string, PairDefinition> = new Map(
	PAIR_DEFINITIONS.map((d) => [d.open, d]),
);
const CLOSE_TO_PAIR: ReadonlyMap<string, PairDefinition> = new Map(
	// For brackets close !== open, for quotes close === open
	PAIR_DEFINITIONS.filter((d) => d.kind === 'bracket').map((d) => [d.close, d]),
);

// --- Action variants ---

export type PairAction =
	| { readonly kind: 'pair'; readonly close: string }
	| { readonly kind: 'overtype' }
	| { readonly kind: 'wrap'; readonly open: string; readonly close: string }
	| { readonly kind: 'passthrough' };

// --- Lookups injected by the caller ---

export type TokenLookup = (blockId: BlockId, offset: number) => SyntaxToken | undefined;

// --- Resolver ---

export interface ResolvePairContext {
	readonly state: EditorState;
	readonly block: BlockNode;
	readonly blockId: BlockId;
	readonly char: string;
	readonly config: ResolvedPairingConfig;
	readonly pairStack: PairStack;
	readonly getTokenAt: TokenLookup;
}

/**
 * Decides what to do when the user types `char` inside a code block.
 * Returns a `PairAction` describing the next step.
 */
export function resolvePairAction(ctx: ResolvePairContext): PairAction {
	const { state, char, config } = ctx;
	if (!isTextSelection(state.selection)) return { kind: 'passthrough' };

	const sel = state.selection;
	const definition: PairDefinition | undefined = OPEN_TO_PAIR.get(char);

	// Wrap takes precedence over suppression when there is a range selection.
	if (definition && !isCollapsed(sel) && surroundEnabled(definition, config)) {
		const wrap = tryWrapAction(definition, sel, ctx);
		if (wrap) return wrap;
	}

	if (!isCollapsed(sel)) return { kind: 'passthrough' };

	// Overtype: user typed a close char that matches the next char and was
	// auto-inserted by us.
	if (config.overtype && shouldOvertype(ctx, char)) {
		return { kind: 'overtype' };
	}

	if (!definition) return { kind: 'passthrough' };

	// Suppression checks for collapsed-cursor auto-pair.
	if (!pairingAllowed(definition, ctx)) return { kind: 'passthrough' };

	return { kind: 'pair', close: definition.close };
}

function tryWrapAction(
	def: PairDefinition,
	sel: Selection,
	ctx: ResolvePairContext,
): PairAction | null {
	const { state } = ctx;
	const order = state.getBlockOrder();
	const range = selectionRange(sel, order);
	if (range.from.blockId !== range.to.blockId) return null;
	if (range.from.blockId !== ctx.blockId) return null;
	return { kind: 'wrap', open: def.open, close: def.close };
}

function shouldOvertype(ctx: ResolvePairContext, char: string): boolean {
	const closeDef: PairDefinition | undefined = closeDefinitionFor(char);
	if (!closeDef) return false;

	const sel = ctx.state.selection;
	if (!isTextSelection(sel)) return false;

	const text: string = getBlockText(ctx.block);
	const offset: number = sel.anchor.offset;
	if (text[offset] !== char) return false;

	// Only overtype if this exact close char was recorded by an auto-pair.
	const entry = ctx.pairStack.peek(ctx.blockId, offset);
	return Boolean(entry && entry.char === char);
}

/**
 * Returns the pair definition where `char` is a close char. Quotes are
 * symmetric, so `OPEN_TO_PAIR` is checked first for them.
 */
function closeDefinitionFor(char: string): PairDefinition | undefined {
	const symmetric = OPEN_TO_PAIR.get(char);
	if (symmetric?.kind === 'quote') return symmetric;
	return CLOSE_TO_PAIR.get(char);
}

function surroundEnabled(def: PairDefinition, config: ResolvedPairingConfig): boolean {
	switch (config.surround) {
		case 'never':
			return false;
		case 'brackets':
			return def.kind === 'bracket';
		case 'quotes':
			return def.kind === 'quote';
		case 'languageDefined':
			return true;
	}
}

function pairingAllowed(def: PairDefinition, ctx: ResolvePairContext): boolean {
	const mode: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never' =
		def.kind === 'quote' ? ctx.config.quotes : ctx.config.brackets;
	if (mode === 'never') return false;

	const sel = ctx.state.selection;
	if (!isTextSelection(sel)) return true;
	const text: string = getBlockText(ctx.block);
	const offset: number = sel.anchor.offset;

	if (def.kind === 'quote' && def.open === "'" && isApostropheContext(text, offset)) {
		return false;
	}

	if (mode === 'always') return true;
	if (mode === 'beforeWhitespace') {
		return isFollowingCharCompatibleForPair(text, offset);
	}
	// languageDefined
	if (def.kind === 'quote') {
		const token = ctx.getTokenAt(ctx.blockId, offset);
		if (!token) {
			// Cache miss: fall back to always-allow (safe default).
			return true;
		}
		if (token.type === 'string' || token.type === 'comment') return false;
		return true;
	}
	// Brackets always pair under languageDefined
	return true;
}

/**
 * VS-Code-style apostrophe suppression: `'` directly after a word char
 * `[A-Za-z0-9_]` is *not* paired (so `don't`, `it's` work).
 */
function isApostropheContext(text: string, offset: number): boolean {
	if (offset <= 0) return false;
	const prev = text[offset - 1];
	if (!prev) return false;
	return /[A-Za-z0-9_]/.test(prev);
}

function isFollowingCharCompatibleForPair(text: string, offset: number): boolean {
	if (offset >= text.length) return true;
	const next = text[offset];
	if (!next) return true;
	if (/\s/.test(next)) return true;
	if (CLOSE_TO_PAIR.has(next)) return true;
	return false;
}

/**
 * Wrap-selection helper: given the open/close chars and a selection, returns
 * the offsets where the chars should be inserted in document order.
 */
export interface WrapPlan {
	readonly fromOffset: number;
	readonly toOffset: number;
}

export function wrapSelectionPlan(sel: Selection, blockOrder: readonly BlockId[]): WrapPlan {
	const range = selectionRange(sel, blockOrder);
	return { fromOffset: range.from.offset, toOffset: range.to.offset };
}
