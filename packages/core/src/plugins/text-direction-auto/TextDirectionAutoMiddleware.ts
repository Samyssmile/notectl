/**
 * Middleware registrations for the TextDirectionAutoPlugin.
 *
 * Three independent middlewares that all operate on the block-level `dir`
 * attribute owned by the {@link TextDirectionPlugin}:
 *
 * - **preserveDir**: keeps `dir` when another plugin replaces a block's
 *   attrs (e.g. `setBlockType` paragraph → heading).
 * - **autoDetect**: on `insertText` / `deleteText`, detects direction from
 *   the first strong directional character and updates `dir`.
 * - **inheritDir**: on `insertNode`, inherits the new block's `dir` from
 *   the nearest sibling (or auto-detects from inserted text content).
 */

import type { BlockNode } from '../../model/Document.js';
import { blockOffsetToTextOffset, getBlockLength, getBlockText } from '../../model/Document.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Step } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import {
	detectTextDirection,
	findSiblingDirection,
	getBlockDir,
} from '../text-direction/DirectionDetection.js';
import type { TextDirection } from '../text-direction/TextDirectionService.js';

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

function buildDirChangeStep(
	state: EditorState,
	block: BlockNode,
	dir: TextDirection | 'auto',
): Step | undefined {
	const path = state.getNodePath(block.id);
	if (!path) return undefined;

	return {
		type: 'setNodeAttr',
		path,
		attrs: { ...block.attrs, dir },
		previousAttrs: block.attrs,
	};
}

function handleInsertText(
	step: Extract<Step, { type: 'insertText' }>,
	state: EditorState,
	directableTypes: ReadonlySet<string>,
	extraSteps: Step[],
): void {
	const block = state.getBlock(step.blockId);
	if (!block || !directableTypes.has(block.type)) return;

	if (getBlockDir(block) !== 'auto' && getBlockLength(block) > 0) return;

	const existingText: string = getBlockText(block);
	const textOffset: number = blockOffsetToTextOffset(block, step.offset);
	const textAfter: string =
		existingText.slice(0, textOffset) + step.text + existingText.slice(textOffset);

	const detected: TextDirection | null = detectTextDirection(textAfter);
	if (!detected) return;

	const dirStep: Step | undefined = buildDirChangeStep(state, block, detected);
	if (dirStep) extraSteps.push(dirStep);
}

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
