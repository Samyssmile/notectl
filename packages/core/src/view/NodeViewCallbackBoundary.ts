/** Runtime isolation for plugin-owned NodeView factories and lifecycle callbacks. */

import type { BlockNode } from '../model/Document.js';
import { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import type { NodeView } from './NodeView.js';
import type { NodeViewEntry } from './NodeViewRegistry.js';

const destroyedNodeViews = new WeakSet<object>();

/**
 * Creates an editor-owned NodeView façade. Factory failure returns `null` so
 * block rendering can continue through the NodeSpec/core fallback path.
 */
export function createGuardedNodeView(
	entry: NodeViewEntry,
	node: BlockNode,
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
	executor: PluginCallbackExecutor = PluginCallbackExecutor.silent,
): NodeView | null {
	const outcome = executor.execute(
		{ pluginId: entry.pluginId, name: `${entry.name}:factory`, kind: 'node-view' },
		() => guardNodeView(entry, entry.factory(node, getState, dispatch), executor),
	);
	return outcome.ok ? outcome.value : null;
}

function guardNodeView(
	entry: NodeViewEntry,
	raw: NodeView,
	executor: PluginCallbackExecutor,
): NodeView {
	if ((typeof raw !== 'object' && typeof raw !== 'function') || raw === null) {
		throw new TypeError(`${entry.name} NodeView factory must return a NodeView object.`);
	}

	const dom = requireHTMLElement(raw.dom, `${entry.name}.dom`);
	const rawContentDOM = raw.contentDOM;
	if (rawContentDOM !== null && !(rawContentDOM instanceof HTMLElement)) {
		throw new TypeError(`${entry.name}.contentDOM must be an HTMLElement or null.`);
	}
	const contentDOM: HTMLElement | null = rawContentDOM;
	const getContentDOM = raw.getContentDOM;
	const update = raw.update;
	const destroy = raw.destroy;
	const selectNode = raw.selectNode;
	const deselectNode = raw.deselectNode;

	return {
		dom,
		contentDOM,
		...(getContentDOM
			? {
					getContentDOM(childId: string): HTMLElement | null {
						const outcome = executor.execute(
							{
								pluginId: entry.pluginId,
								name: `${entry.name}:getContentDOM`,
								kind: 'node-view',
							},
							() => {
								const result = getContentDOM.call(raw, childId);
								if (result === null) return null;
								return requireHTMLElement(result, `${entry.name}.getContentDOM`);
							},
						);
						return outcome.ok ? outcome.value : null;
					},
				}
			: {}),
		...(update
			? {
					update(updatedNode: BlockNode): boolean {
						const outcome = executor.execute(
							{
								pluginId: entry.pluginId,
								name: `${entry.name}:update`,
								kind: 'node-view',
							},
							() => {
								const handled = update.call(raw, updatedNode);
								if (typeof handled !== 'boolean') {
									throw new TypeError(`${entry.name}.update must return a boolean.`);
								}
								return handled;
							},
						);
						return outcome.ok ? outcome.value : false;
					},
				}
			: {}),
		...(destroy
			? {
					destroy(): void {
						if (destroyedNodeViews.has(raw)) return;
						destroyedNodeViews.add(raw);
						executor.execute(
							{
								pluginId: entry.pluginId,
								name: `${entry.name}:destroy`,
								kind: 'node-view',
							},
							() => destroy.call(raw),
						);
					},
				}
			: {}),
		...(selectNode
			? {
					selectNode(): void {
						const outcome = executor.execute(
							{
								pluginId: entry.pluginId,
								name: `${entry.name}:selectNode`,
								kind: 'node-view',
							},
							() => selectNode.call(raw),
						);
						if (!outcome.ok) dom.classList.add('notectl-node-selected');
					},
				}
			: {}),
		...(deselectNode
			? {
					deselectNode(): void {
						const outcome = executor.execute(
							{
								pluginId: entry.pluginId,
								name: `${entry.name}:deselectNode`,
								kind: 'node-view',
							},
							() => deselectNode.call(raw),
						);
						if (!outcome.ok) dom.classList.remove('notectl-node-selected');
					},
				}
			: {}),
	};
}

function requireHTMLElement(value: unknown, memberName: string): HTMLElement {
	if (value instanceof HTMLElement) return value;
	throw new TypeError(`${memberName} must be an HTMLElement.`);
}
