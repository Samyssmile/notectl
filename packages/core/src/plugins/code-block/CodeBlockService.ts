/**
 * Service API for code blocks.
 * Provides language/background getters and setters.
 */

import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import { findNodePath } from '../../model/NodeResolver.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import type { CodeBlockConfig } from './CodeBlockTypes.js';
import { CODE_BLOCK_SERVICE_KEY } from './CodeBlockTypes.js';

/** Registers the CodeBlockService on the given context. */
export function registerCodeBlockService(
	context: PluginContext,
	config: CodeBlockConfig,
	getContext: () => PluginContext | null,
): void {
	context.registerService(CODE_BLOCK_SERVICE_KEY, {
		setLanguage(bid: BlockId, language: string): void {
			setAttr(context, bid, 'language', language);
		},

		getLanguage(bid: BlockId): string {
			const ctx: PluginContext | null = getContext();
			if (!ctx) return '';
			const block: BlockNode | undefined = ctx.getState().getBlock(bid);
			if (!block || block.type !== 'code_block') return '';
			return (block.attrs?.language as string) ?? '';
		},

		setBackground(bid: BlockId, color: string): void {
			setAttr(context, bid, 'backgroundColor', color);
		},

		getBackground(bid: BlockId): string {
			const ctx: PluginContext | null = getContext();
			if (!ctx) return '';
			const block: BlockNode | undefined = ctx.getState().getBlock(bid);
			if (!block || block.type !== 'code_block') return '';
			return (block.attrs?.backgroundColor as string) ?? '';
		},

		isCodeBlock(bid: BlockId): boolean {
			const ctx: PluginContext | null = getContext();
			if (!ctx) return false;
			const block: BlockNode | undefined = ctx.getState().getBlock(bid);
			return block?.type === 'code_block';
		},

		getSupportedLanguages(): readonly string[] {
			if (config.highlighter) {
				return config.highlighter.getSupportedLanguages();
			}
			return [];
		},
	});
}

// --- Helper ---

function setAttr(context: PluginContext, bid: BlockId, key: string, value: string): void {
	const state = context.getState();
	const block: BlockNode | undefined = state.getBlock(bid);
	if (!block || block.type !== 'code_block') return;

	const path: string[] | undefined = findNodePath(state.doc, bid);
	if (!path) return;

	const newAttrs: BlockAttrs = { ...block.attrs, [key]: value };
	const tr: Transaction = state
		.transaction('command')
		.setNodeAttr(path as BlockId[], newAttrs)
		.build();

	context.dispatch(tr);
}
