import { type NotectlEditor, createEditor } from '@notectl/core';
import { FontSizePlugin } from '@notectl/core/plugins/font-size';
import { HardBreakPlugin } from '@notectl/core/plugins/hard-break';
import { HeadingPlugin } from '@notectl/core/plugins/heading';
import { HorizontalRulePlugin } from '@notectl/core/plugins/horizontal-rule';
import { LinkPlugin } from '@notectl/core/plugins/link';
import {
	TablePlugin,
	type TableSelectionService,
	TableSelectionServiceKey,
} from '@notectl/core/plugins/table';
import { type EditorUIService, EditorUIServiceKey, PopupServiceKey } from '@notectl/core/ui';
import { TechnicalUIPlugin, addSelectionPopup, mountControls } from './CustomUIControls.js';

export interface DemoEditor {
	readonly editor: NotectlEditor;
	readonly ui: EditorUIService;
	readonly cells: TableSelectionService | undefined;
}
declare global {
	interface Window {
		uiDemo: Readonly<Record<'external' | 'plugin', DemoEditor>>;
	}
}

const cleanups: (() => void)[] = [];
async function setup(id: 'external' | 'plugin'): Promise<DemoEditor> {
	const host = document.getElementById(`${id}-editor`);
	if (!host) throw new Error('Missing example host');
	const editor = await createEditor({
		plugins: [
			new HardBreakPlugin(),
			new LinkPlugin(),
			new FontSizePlugin(),
			new HeadingPlugin(),
			new TablePlugin(),
			new HorizontalRulePlugin(),
			...(id === 'plugin' ? [new TechnicalUIPlugin()] : []),
		],
	});
	host.append(editor);
	await editor.whenReady();
	editor.setText(
		'Select a few words across several lines to inspect the selection geometry. ' +
			'These controls use the same actions as the standard toolbar.\nمرحبا بالعالم — RTL text',
	);
	const ui = editor.getService(EditorUIServiceKey);
	const popups = editor.getService(PopupServiceKey);
	if (!ui || !popups) throw new Error('Missing editor services');
	if (id === 'external') {
		const controls = document.getElementById('external-controls');
		if (!controls) throw new Error('Missing controls');
		cleanups.push(mountControls(ui, controls));
		addSelectionPopup(ui, popups, controls);
	}
	return { editor, ui, cells: editor.getService(TableSelectionServiceKey) };
}

window.uiDemo = { external: await setup('external'), plugin: await setup('plugin') };
window.addEventListener(
	'pagehide',
	() => {
		for (const cleanup of cleanups) cleanup();
		for (const { editor } of Object.values(window.uiDemo)) void editor.destroy();
	},
	{ once: true },
);
