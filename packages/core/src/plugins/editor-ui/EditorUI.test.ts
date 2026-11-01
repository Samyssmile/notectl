import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../register.js';
import { NotectlEditor } from '../../editor/NotectlEditor.js';
import { createSelection, isTextSelection } from '../../model/Selection.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { FontSizePlugin } from '../font-size/FontSizePlugin.js';
import { LinkPlugin } from '../link/LinkPlugin.js';
import { PopupServiceKey } from '../shared/PopupManager.js';
import { TablePlugin } from '../table/TablePlugin.js';
import type { ToolbarItem } from '../toolbar/ToolbarItem.js';
import { EditorUIServiceKey } from './EditorUI.js';

const editors: NotectlEditor[] = [];
async function setup(plugins: readonly Plugin[] = []): Promise<NotectlEditor> {
	const editor = new NotectlEditor();
	editors.push(editor);
	document.body.append(editor);
	await editor.init({ plugins });
	editor.setText('one two');
	const state = editor.getState();
	if (!isTextSelection(state.selection)) throw new Error('Expected text selection');
	editor.dispatch(
		state
			.transaction('api')
			.setSelection(
				createSelection(
					{ ...state.selection.anchor, offset: 0 },
					{ ...state.selection.head, offset: 3 },
				),
			)
			.build(),
	);
	return editor;
}

function action(id: string, command = id): ToolbarItem {
	return { id, command, label: id, group: 'test', icon: '' };
}

afterEach(async () => {
	for (const editor of editors.splice(0)) await editor.destroy();
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('public editor UI service without a standard toolbar', () => {
	it('publishes immutable action snapshots and observes formatting, undo and readonly', async () => {
		const editor = await setup();
		const ui = editor.getService(EditorUIServiceKey);
		if (!ui) throw new Error('Missing UI service');
		expect(editor.shadowRoot?.querySelector('[role="toolbar"]')).toBeNull();
		const listener = vi.fn();
		const unsubscribe = ui.subscribeActions(listener);
		const initial = ui.getActions();
		expect(Object.isFrozen(initial)).toBe(true);
		expect(initial.every(Object.isFrozen)).toBe(true);
		expect(ui.executeAction('bold')).toBe(true);
		expect(ui.getActions().find((a) => a.id === 'bold')?.active).toBe(true);
		expect(initial.find((a) => a.id === 'bold')?.active).toBe(false);
		editor.commands.undo();
		expect(ui.getActions().find((a) => a.id === 'bold')?.active).toBe(false);
		editor.configure({ readonly: true });
		expect(ui.executeAction('bold')).toBe(false);
		expect(ui.getActions().every((a) => !a.enabled)).toBe(true);
		unsubscribe();
		unsubscribe();
		const calls = listener.mock.calls.length;
		editor.configure({ readonly: false });
		expect(listener).toHaveBeenCalledTimes(calls);
	});

	it('observes command and item registration; respects missing commands and readonlyAllowed', async () => {
		let context: PluginContext | undefined;
		const editor = await setup([
			{
				id: 'dynamic',
				name: 'Dynamic',
				init(ctx) {
					context = ctx;
				},
			},
		]);
		if (!context) throw new Error('Missing context');
		const ui = editor.getService(EditorUIServiceKey);
		context.registerToolbarItem(action('late'));
		expect(ui?.getActions().find((a) => a.id === 'late')?.enabled).toBe(false);
		const handler = vi.fn(() => true);
		context.registerCommand('late', handler, { readonlyAllowed: true });
		expect(ui?.getActions().find((a) => a.id === 'late')?.enabled).toBe(true);
		editor.configure({ readonly: true });
		expect(ui?.executeAction('late')).toBe(true);
		expect(handler).toHaveBeenCalledOnce();
		context.getToolbarRegistry().removeToolbarItem('late');
		expect(ui?.getActions().find((a) => a.id === 'late')).toBeUndefined();
		expect(ui?.executeAction('late')).toBe(false);
	});

	it('rechecks availability at execution and isolates a failing subscriber', async () => {
		let enabled = true;
		const command = vi.fn(() => true);
		const editor = await setup([
			{
				id: 'conditional',
				name: 'Conditional',
				init(ctx) {
					ctx.registerCommand('conditional', command);
					ctx.registerToolbarItem({ ...action('conditional'), isEnabled: () => enabled });
				},
			},
		]);
		const ui = editor.getService(EditorUIServiceKey);
		enabled = false;
		expect(ui?.executeAction('conditional')).toBe(false);
		expect(command).not.toHaveBeenCalled();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		ui?.subscribeActions(() => {
			throw new Error('consumer failure');
		});
		const healthy = vi.fn();
		ui?.subscribeActions(healthy);
		ui?.refresh();
		expect(healthy).toHaveBeenCalledTimes(2);
		expect(error).toHaveBeenCalled();
	});

	it('opens existing grid, custom and combobox feature popups without ToolbarPlugin', async () => {
		const editor = await setup([new TablePlugin(), new LinkPlugin(), new FontSizePlugin()]);
		const ui = editor.getService(EditorUIServiceKey);
		const anchor = new DOMRect(10, 10, 20, 20);
		for (const id of ['table', 'link', 'fontSize']) {
			const popup = ui?.openAction(id, { anchor });
			expect(popup, id).toBeTruthy();
			expect(popup?.getElement().childElementCount).toBeGreaterThan(0);
			popup?.close();
			expect(ui?.isPopupOpen()).toBe(false);
		}
	});

	it('renders dropdown commands and closes popups when their action is removed', async () => {
		let ctx: PluginContext | undefined;
		const run = vi.fn(() => true);
		const editor = await setup([
			{
				id: 'dropdown',
				name: 'Dropdown',
				init(context) {
					ctx = context;
					context.registerCommand('run', run);
					context.registerToolbarItem({
						...action('choices', ''),
						popupType: 'dropdown',
						popupConfig: { items: [{ command: 'run', label: 'Run' }] },
					});
				},
			},
		]);
		const ui = editor.getService(EditorUIServiceKey);
		ui?.openAction('choices', { anchor: new DOMRect(10, 10, 20, 20) })
			?.getElement()
			.querySelector<HTMLButtonElement>('button')
			?.click();
		expect(run).toHaveBeenCalledOnce();
		ui?.openAction('choices', { anchor: new DOMRect(10, 10, 20, 20) });
		ctx?.getToolbarRegistry().removeToolbarItem('choices');
		expect(ui?.isPopupOpen()).toBe(false);
	});

	it('releases observers, subscribers and retained handles after destroy', async () => {
		const editor = new NotectlEditor();
		expect(editor.getService(EditorUIServiceKey)).toBeUndefined();
		editors.push(editor);
		document.body.append(editor);
		await editor.init();
		const ui = editor.getService(EditorUIServiceKey);
		const popupService = editor.getService(PopupServiceKey);
		const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect');
		const listener = vi.fn();
		const unsubscribe = ui?.subscribeSelection(listener);
		ui?.invalidateGeometry();
		unsubscribe?.();
		expect(disconnect).toHaveBeenCalled();
		const calls = listener.mock.calls.length;
		await editor.destroy();
		ui?.invalidateGeometry();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		expect(listener).toHaveBeenCalledTimes(calls);
		expect(ui?.getActions()).toEqual([]);
		expect(ui?.getSelection().geometry).toBeNull();
		expect(ui?.executeAction('bold')).toBe(false);
		expect(ui?.focusEditor()).toBe(false);
		expect(editor.getService(EditorUIServiceKey)).toBeUndefined();
		expect(() => popupService?.open({ anchor: new DOMRect(), content() {} })).toThrow('destroyed');
	});
});
