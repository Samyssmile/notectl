/**
 * Middleware registrations for the TextDirectionPlugin.
 * Separated from the main plugin file for maintainability.
 */

import type { BlockNode } from '../../model/Document.js';
import { blockOffsetToTextOffset, getBlockText } from '../../model/Document.js';
import { findNodePath } from '../../model/NodeResolver.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Step } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { detectTextDirection, findSiblingDirection, getBlockDir } from './DirectionDetection.js';
import type { TextDirection } from './TextDirectionPlugin.js';

/**
 * Preserves the `dir` attribute when other plugins change the block
 * type (e.g. paragraph -> heading) via `setBlockType`, which replaces attrs.
 */
export function registerPreserveDirMiddleware(
	context: PluginContext,
	directableTypes: ReadonlySet<string>,
): void {
	context.registerMiddleware(
		(tr, _state, next) => {
			let patched = false;

			const patchedSteps = tr.steps.map((step) => {
				if (step.type !== 'setBlockType') return step;
				if (!directableTypes.has(step.nodeType)) return step;

				const prevDir = step.previousAttrs?.dir;
				if (!prevDir || prevDir === 'auto') return step;

				patched = true;
				return {
					...step,
					attrs: { ...step.attrs, dir: prevDir },
				};
			});

			next(patched ? { ...tr, steps: patchedSteps } : tr);
		},
		{ name: 'text-direction:preserve-dir' },
	);
}

/**
 * Auto-detects text direction on `insertText` and `deleteText` steps
 * for blocks with `dir="auto"` (or blocks whose content changes direction).
 * Uses the first strong directional character to determine LTR vs RTL.
 */
export function registerAutoDetectMiddleware(
	context: PluginContext,
	directableTypes: ReadonlySet<string>,
): void {
	context.registerMiddleware(
		(tr, state, next) => {
			const extraSteps: Step[] = [];

			for (const step of tr.steps) {
				if (step.type === 'insertText') {
					handleInsertText(step, state, directableTypes, extraSteps);
				} else if (step.type === 'deleteText') {
					handleDeleteText(step, state, directableTypes, extraSteps);
				}
			}

			if (extraSteps.length > 0) {
				next({ ...tr, steps: [...tr.steps, ...extraSteps] });
			} else {
				next(tr);
			}
		},
		{ name: 'text-direction:auto-detect' },
	);
}

/** Builds a `setNodeAttr` step to change the `dir` attribute of a block. */
function buildDirChangeStep(
	state: EditorState,
	block: BlockNode,
	dir: TextDirection | 'auto',
): Step | undefined {
	const path = findNodePath(state.doc, block.id);
	if (!path) return undefined;

	return {
		type: 'setNodeAttr',
		path: path as BlockId[],
		attrs: { ...block.attrs, dir },
		previousAttrs: block.attrs as Record<string, string | number | boolean>,
	};
}

/** Handles direction detection after text insertion. */
function handleInsertText(
	step: Extract<Step, { type: 'insertText' }>,
	state: EditorState,
	directableTypes: ReadonlySet<string>,
	extraSteps: Step[],
): void {
	const block = state.getBlock(step.blockId);
	if (!block || !directableTypes.has(block.type)) return;

	const existingText: string = getBlockText(block);
	if (getBlockDir(block) !== 'auto' && existingText.length > 0) return;

	const textOffset: number = blockOffsetToTextOffset(block, step.offset);
	const textAfter: string =
		existingText.slice(0, textOffset) + step.text + existingText.slice(textOffset);

	const detected: TextDirection | null = detectTextDirection(textAfter);
	if (!detected) return;

	const dirStep: Step | undefined = buildDirChangeStep(state, block, detected);
	if (dirStep) extraSteps.push(dirStep);
}

/** Handles direction re-detection after text deletion. */
function handleDeleteText(
	step: Extract<Step, { type: 'deleteText' }>,
	state: EditorState,
	directableTypes: ReadonlySet<string>,
	extraSteps: Step[],
): void {
	const block = state.getBlock(step.blockId);
	if (!block || !directableTypes.has(block.type)) return;

	const currentDir: TextDirection = getBlockDir(block);
	if (currentDir === 'auto') return;

	const existingText: string = getBlockText(block);
	const fromText: number = blockOffsetToTextOffset(block, step.from);
	const toText: number = blockOffsetToTextOffset(block, step.to);
	const textAfter: string = existingText.slice(0, fromText) + existingText.slice(toText);

	if (textAfter.length === 0) {
		const dirStep: Step | undefined = buildDirChangeStep(state, block, 'auto');
		if (dirStep) extraSteps.push(dirStep);
		return;
	}

	const detected: TextDirection | null = detectTextDirection(textAfter);
	if (!detected || detected === currentDir) return;

	const dirStep: Step | undefined = buildDirChangeStep(state, block, detected);
	if (dirStep) extraSteps.push(dirStep);
}

/**
 * Inherits `dir` from the nearest sibling when inserting a new block
 * (e.g. via GapCursor or NodeSelection).
 */
export function registerInheritDirMiddleware(
	context: PluginContext,
	directableTypes: ReadonlySet<string>,
): void {
	context.registerMiddleware(
		(tr, state, next) => {
			let patched = false;

			const patchedSteps = tr.steps.map((step) => {
				if (step.type !== 'insertNode') return step;
				if (!directableTypes.has(step.node.type)) return step;

				const newDir: string = String(step.node.attrs?.dir ?? 'auto');
				if (newDir !== 'auto') return step;

				// Detect direction from inserted node's text content
				const nodeText: string = getBlockText(step.node);
				if (nodeText.length > 0) {
					const detected: TextDirection | null = detectTextDirection(nodeText);
					if (detected) {
						patched = true;
						return {
							...step,
							node: {
								...step.node,
								attrs: { ...step.node.attrs, dir: detected },
							},
						};
					}
				}

				// Fall back to sibling direction for empty blocks
				const siblingDir: string | undefined = findSiblingDirection(
					state,
					step.parentPath,
					step.index,
				);
				if (!siblingDir || siblingDir === 'auto') return step;

				patched = true;
				return {
					...step,
					node: {
						...step.node,
						attrs: { ...step.node.attrs, dir: siblingDir },
					},
				};
			});

			next(patched ? { ...tr, steps: patchedSteps } : tr);
		},
		{ name: 'text-direction:inherit-dir' },
	);
}
