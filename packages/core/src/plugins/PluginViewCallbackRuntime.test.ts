import { describe, expect, it, vi } from 'vitest';
import { DecorationSet, widget } from '../decorations/Decoration.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import { schemaFromRegistry } from '../model/Schema.js';
import { createCollapsedSelection, createNodeSelection } from '../model/Selection.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { makePluginOptions } from '../test/TestUtils.js';
import { EditorView } from '../view/EditorView.js';
import type { Logger } from './Logger.js';
import { PluginManager } from './PluginManager.js';

function createLogger(): Logger {
	return {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	};
}

describe('plugin-owned view callback runtime', () => {
	it('falls back from a throwing NodeView factory without aborting the initial render', async () => {
		const logger = createLogger();
		const failure = new Error('broken NodeView factory');
		const pm = new PluginManager({ logger });
		pm.register({
			id: 'view-owner',
			name: 'View owner',
			init(context) {
				context.registerNodeSpec({
					type: 'owned-block',
					toDOM(node) {
						const element = document.createElement('article');
						element.setAttribute('data-block-id', node.id);
						return element;
					},
				});
				context.registerNodeView('owned-block', () => {
					throw failure;
				});
			},
		});
		await pm.init(makePluginOptions());
		const id = blockId('owned');
		const state = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('owned-block'), [createTextNode('survives')], id),
			]),
			selection: createCollapsedSelection(id, 0),
			schema: schemaFromRegistry(pm.schemaRegistry),
		});
		const container = document.createElement('div');

		const view = new EditorView(container, {
			state,
			schemaRegistry: pm.schemaRegistry,
			nodeViewRegistry: pm.nodeViewRegistry,
			callbackExecutor: pm.getCallbackExecutor(),
		});

		expect(container.querySelector('article')?.textContent).toBe('survives');
		expect(logger.error).toHaveBeenCalledWith(
			'[PluginCallback] Plugin "view-owner" node-view "owned-block:factory" error',
			failure,
		);
		view.destroy();
		await pm.destroy();
	});

	it('recovers from NodeView update/selection failures and completes every destroy callback', async () => {
		const logger = createLogger();
		const updateFailure = new Error('broken NodeView update');
		const selectFailure = new Error('broken NodeView select');
		const deselectFailure = new Error('broken NodeView deselect');
		const destroyFailure = new Error('broken NodeView destroy');
		const destroyedIds: string[] = [];
		const pm = new PluginManager({ logger });
		pm.register({
			id: 'view-owner',
			name: 'View owner',
			init(context) {
				context.registerNodeSpec({
					type: 'owned-block',
					selectable: true,
					toDOM(node) {
						const element = document.createElement('article');
						element.setAttribute('data-block-id', node.id);
						return element;
					},
				});
				context.registerNodeView('owned-block', (node) => {
					const dom = document.createElement('section');
					dom.setAttribute('data-block-id', node.id);
					return {
						dom,
						contentDOM: dom,
						update() {
							dom.textContent = 'partially mutated';
							throw updateFailure;
						},
						selectNode() {
							throw selectFailure;
						},
						deselectNode() {
							throw deselectFailure;
						},
						destroy() {
							destroyedIds.push(node.id);
							throw destroyFailure;
						},
					};
				});
			},
		});
		await pm.init(makePluginOptions());
		const firstId = blockId('first');
		const secondId = blockId('second');
		const state = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('owned-block'), [createTextNode('first')], firstId),
				createBlockNode(nodeType('owned-block'), [createTextNode('second')], secondId),
			]),
			selection: createCollapsedSelection(firstId, 0),
			schema: schemaFromRegistry(pm.schemaRegistry),
		});
		const container = document.createElement('div');
		const view = new EditorView(container, {
			state,
			schemaRegistry: pm.schemaRegistry,
			nodeViewRegistry: pm.nodeViewRegistry,
			callbackExecutor: pm.getCallbackExecutor(),
		});

		view.dispatch(
			view
				.getState()
				.transaction('input')
				.insertText(firstId, 5, '!', [])
				.setSelection(createCollapsedSelection(firstId, 6))
				.build(),
		);
		expect(view.getState().doc.children[0]?.children[0]).toMatchObject({ text: 'first!' });
		expect(container.querySelector('[data-block-id="first"]')?.textContent).toBe('first!');

		view.dispatch(
			view
				.getState()
				.transaction('api')
				.setSelection(createNodeSelection(firstId, [firstId]))
				.build(),
		);
		expect(
			container
				.querySelector('[data-block-id="first"]')
				?.classList.contains('notectl-node-selected'),
		).toBe(true);
		view.dispatch(
			view
				.getState()
				.transaction('api')
				.setSelection(createNodeSelection(secondId, [secondId]))
				.build(),
		);
		expect(
			container
				.querySelector('[data-block-id="first"]')
				?.classList.contains('notectl-node-selected'),
		).toBe(false);
		expect(
			container
				.querySelector('[data-block-id="second"]')
				?.classList.contains('notectl-node-selected'),
		).toBe(true);

		expect(() => view.destroy()).not.toThrow();
		expect(destroyedIds).toEqual(expect.arrayContaining(['first', 'second']));
		expect(logger.error).toHaveBeenCalledWith(
			'[PluginCallback] Plugin "view-owner" node-view "owned-block:update" error',
			updateFailure,
		);
		expect(logger.error).toHaveBeenCalledWith(
			'[PluginCallback] Plugin "view-owner" node-view "owned-block:selectNode" error',
			selectFailure,
		);
		expect(logger.error).toHaveBeenCalledWith(
			'[PluginCallback] Plugin "view-owner" node-view "owned-block:deselectNode" error',
			deselectFailure,
		);
		expect(logger.error).toHaveBeenCalledWith(
			'[PluginCallback] Plugin "view-owner" node-view "owned-block:destroy" error',
			destroyFailure,
		);
		await pm.destroy();
	});

	it('uses attributed DOM fallbacks for throwing node, mark, inline-node, and widget renderers', async () => {
		const logger = createLogger();
		const nodeFailure = new Error('broken node renderer');
		const markFailure = new Error('broken mark renderer');
		const inlineFailure = new Error('broken inline renderer');
		const widgetFailure = new Error('broken widget renderer');
		const pm = new PluginManager({ logger });
		const id = blockId('owned');
		pm.register({
			id: 'render-owner',
			name: 'Render owner',
			init(context) {
				context.registerNodeSpec({
					type: 'owned-block',
					toDOM: () => {
						throw nodeFailure;
					},
				});
				context.registerMarkSpec({
					type: 'owned-mark',
					toDOM: () => {
						throw markFailure;
					},
				});
				context.registerInlineNodeSpec({
					type: 'owned-inline',
					toDOM: () => {
						throw inlineFailure;
					},
				});
			},
			decorations() {
				return DecorationSet.create([
					widget(id, 0, () => {
						throw widgetFailure;
					}),
				]);
			},
		});
		await pm.init(makePluginOptions());
		const state = EditorState.create({
			doc: createDocument([
				createBlockNode(
					nodeType('owned-block'),
					[
						createTextNode('safe', [{ type: markType('owned-mark') }]),
						createInlineNode(inlineType('owned-inline')),
					],
					id,
				),
			]),
			selection: createCollapsedSelection(id, 0),
			schema: schemaFromRegistry(pm.schemaRegistry),
		});
		const container = document.createElement('div');
		const view = new EditorView(container, {
			state,
			schemaRegistry: pm.schemaRegistry,
			getDecorations: (current, tr) => pm.collectDecorations(current, tr),
			callbackExecutor: pm.getCallbackExecutor(),
		});

		expect(container.textContent).toContain('safe');
		expect(container.querySelector('[data-inline-type="owned-inline"]')).not.toBeNull();
		expect(container.querySelector('[data-decoration-widget]')).not.toBeNull();
		for (const [kind, name, failure] of [
			['schema-render', 'owned-block:toDOM', nodeFailure],
			['schema-render', 'owned-mark:toDOM', markFailure],
			['schema-render', 'owned-inline:toDOM', inlineFailure],
			['widget-render', 'widget:toDOM', widgetFailure],
		] as const) {
			expect(logger.error).toHaveBeenCalledWith(
				`[PluginCallback] Plugin "render-owner" ${kind} "${name}" error`,
				failure,
			);
		}

		view.destroy();
		await pm.destroy();
	});
});
