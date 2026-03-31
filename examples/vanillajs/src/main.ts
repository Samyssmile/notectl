import { ThemePreset, createEditor } from '@notectl/core';
import type { NotectlEditor, StateChangeEvent, Theme } from '@notectl/core';
import { STARTER_FONTS } from '@notectl/core/fonts';
import { AlignmentPlugin } from '@notectl/core/plugins/alignment';
import { BlockquotePlugin } from '@notectl/core/plugins/blockquote';
import { FontPlugin } from '@notectl/core/plugins/font';
import { FontSizePlugin } from '@notectl/core/plugins/font-size';
import { HeadingPlugin } from '@notectl/core/plugins/heading';
import { HighlightPlugin } from '@notectl/core/plugins/highlight';
import { HorizontalRulePlugin } from '@notectl/core/plugins/horizontal-rule';
import { ImagePlugin } from '@notectl/core/plugins/image';
import { LinkPlugin } from '@notectl/core/plugins/link';
import { ListPlugin } from '@notectl/core/plugins/list';
import { StrikethroughPlugin } from '@notectl/core/plugins/strikethrough';
import { SuperSubPlugin } from '@notectl/core/plugins/super-sub';
import { TablePlugin } from '@notectl/core/plugins/table';
import { TextColorPlugin } from '@notectl/core/plugins/text-color';
import { TextFormattingPlugin } from '@notectl/core/plugins/text-formatting';
import { ToolbarOverflowBehavior, ToolbarPlugin } from '@notectl/core/plugins/toolbar';
import { createFullPreset } from '@notectl/core/presets/full';

declare global {
	interface Window {
		ToolbarPlugin: typeof ToolbarPlugin;
		FontPlugin: typeof FontPlugin;
		FontSizePlugin: typeof FontSizePlugin;
		TextFormattingPlugin: typeof TextFormattingPlugin;
		StrikethroughPlugin: typeof StrikethroughPlugin;
		SuperSubPlugin: typeof SuperSubPlugin;
		TextColorPlugin: typeof TextColorPlugin;
		HighlightPlugin: typeof HighlightPlugin;
		HeadingPlugin: typeof HeadingPlugin;
		BlockquotePlugin: typeof BlockquotePlugin;
		AlignmentPlugin: typeof AlignmentPlugin;
		ListPlugin: typeof ListPlugin;
		LinkPlugin: typeof LinkPlugin;
		TablePlugin: typeof TablePlugin;
		HorizontalRulePlugin: typeof HorizontalRulePlugin;
		ImagePlugin: typeof ImagePlugin;
	}
}

// Expose plugin classes on window for e2e tests
window.ToolbarPlugin = ToolbarPlugin;
window.FontPlugin = FontPlugin;
window.FontSizePlugin = FontSizePlugin;
window.TextFormattingPlugin = TextFormattingPlugin;
window.StrikethroughPlugin = StrikethroughPlugin;
window.SuperSubPlugin = SuperSubPlugin;
window.TextColorPlugin = TextColorPlugin;
window.HighlightPlugin = HighlightPlugin;
window.HeadingPlugin = HeadingPlugin;
window.BlockquotePlugin = BlockquotePlugin;
window.AlignmentPlugin = AlignmentPlugin;
window.ListPlugin = ListPlugin;
window.LinkPlugin = LinkPlugin;
window.TablePlugin = TablePlugin;
window.HorizontalRulePlugin = HorizontalRulePlugin;
window.ImagePlugin = ImagePlugin;

const container = document.getElementById('editor-container') as HTMLElement;

// ─── Inspector helpers ───

function selectElement<T extends HTMLElement>(id: string): T {
	return document.getElementById(id) as T;
}

const tabs: Map<string, HTMLElement> = new Map();
const tabButtons: NodeListOf<HTMLElement> = document.querySelectorAll('.inspect-tab');
const statBlocks: HTMLElement = selectElement('stat-blocks');
const statChars: HTMLElement = selectElement('stat-chars');
const statEmpty: HTMLElement = selectElement('stat-empty');

for (const id of ['json', 'html', 'css-html', 'text', 'info']) {
	tabs.set(id, selectElement(`tab-${id}`));
}

let activeTab = 'json';

function switchTab(tabId: string): void {
	activeTab = tabId;
	for (const [id, el] of tabs) {
		el.classList.toggle('active', id === tabId);
	}
	for (const btn of tabButtons) {
		btn.classList.toggle('active', btn.dataset.tab === tabId);
	}
}

for (const btn of tabButtons) {
	btn.addEventListener('click', () => {
		const tabId: string = btn.dataset.tab ?? 'json';
		switchTab(tabId);
		refreshActiveTab(currentEditor);
	});
}

function setTabContent(tabId: string, text: string): void {
	const el: HTMLElement | undefined = tabs.get(tabId);
	if (!el) return;
	const pre: HTMLElement | null = el.querySelector('pre');
	if (pre) pre.textContent = text;
}

// ─── Real-time refresh ───

let currentEditor: NotectlEditor | null = null;
let refreshScheduled = false;

function scheduleRefresh(editor: NotectlEditor): void {
	if (refreshScheduled) return;
	refreshScheduled = true;
	requestAnimationFrame(() => {
		refreshScheduled = false;
		refreshActiveTab(editor);
		refreshStats(editor);
	});
}

async function refreshActiveTab(editor: NotectlEditor | null): Promise<void> {
	if (!editor) return;

	switch (activeTab) {
		case 'json':
			setTabContent('json', JSON.stringify(editor.getJSON(), null, 2));
			break;
		case 'html': {
			const html: string = await editor.getContentHTML({ pretty: true });
			setTabContent('html', html);
			break;
		}
		case 'css-html': {
			const result = await editor.getContentHTML({ cssMode: 'classes', pretty: true });
			setTabContent(
				'css-html',
				`/* === CSS === */\n${result.css}\n\n/* === HTML === */\n${result.html}`,
			);
			break;
		}
		case 'text':
			setTabContent('text', editor.getText() || '(empty)');
			break;
		case 'info':
			setTabContent(
				'info',
				[
					`isEmpty: ${editor.isEmpty()}`,
					`theme:   ${editor.getTheme()}`,
					`blocks:  ${editor.getJSON().children.length}`,
				].join('\n'),
			);
			break;
	}
}

function refreshStats(editor: NotectlEditor): void {
	const json = editor.getJSON();
	const blockCount: number = json.children.length;
	const text: string = editor.getText() ?? '';
	const charCount: number = text.length;
	const empty: boolean = editor.isEmpty();

	statBlocks.textContent = `${blockCount} block${blockCount !== 1 ? 's' : ''}`;
	statChars.textContent = `${charCount} char${charCount !== 1 ? 's' : ''}`;
	statEmpty.textContent = empty ? 'empty' : 'has content';
}

// ─── Editor init ───

(async () => {
	const preset = createFullPreset({
		font: { fonts: STARTER_FONTS },
		list: { interactiveCheckboxes: true },
		codeBlock: {
			keymap: { insertAfter: 'Mod-Shift-Enter', toggle: 'Mod-Shift-C' },
		},
	});

	const editor: NotectlEditor = await createEditor({
		...preset,
		toolbar: {
			groups: preset.toolbar,
			overflow: ToolbarOverflowBehavior.Flow,
		},
		theme: ThemePreset.Light,
		placeholder: 'Start typing...',
		autofocus: true,
	});

	container.appendChild(editor);
	currentEditor = editor;

	// Real-time state updates
	editor.on('stateChange', (_event: StateChangeEvent) => {
		scheduleRefresh(editor);
	});

	editor.on('ready', () => {
		refreshActiveTab(editor);
		refreshStats(editor);
	});

	// Initial render
	scheduleRefresh(editor);

	// ─── API action buttons ───

	selectElement('btn-undo').addEventListener('click', () => {
		editor.commands.undo();
	});

	selectElement('btn-redo').addEventListener('click', () => {
		editor.commands.redo();
	});

	// ─── Theme toggle ───

	const themeTrack: HTMLElement = selectElement('theme-track');
	selectElement('theme-toggle').addEventListener('click', () => {
		const current: ThemePreset | Theme = editor.getTheme();
		const next: ThemePreset = current === ThemePreset.Dark ? ThemePreset.Light : ThemePreset.Dark;
		editor.setTheme(next);
		themeTrack.classList.toggle('active', next === ThemePreset.Dark);
	});

	// ─── Transform container toggle ───

	let transformActive = false;
	let transformWrapper: HTMLDivElement | null = null;

	selectElement('btn-toggle-transform').addEventListener('click', () => {
		const btn: HTMLElement = selectElement('btn-toggle-transform');
		if (!transformActive) {
			transformWrapper = document.createElement('div');
			transformWrapper.style.cssText =
				'transform: translateY(0); padding: 20px; margin-top: 16px; border: 2px dashed var(--accent); border-radius: 8px; position: relative;';
			const label: HTMLDivElement = document.createElement('div');
			label.textContent = 'transform: translateY(0) — dropdowns should still align correctly';
			label.style.cssText =
				'color: var(--accent); font-size: 12px; margin-bottom: 8px; font-weight: 600;';
			transformWrapper.appendChild(label);
			container.parentElement?.insertBefore(transformWrapper, container);
			transformWrapper.appendChild(container);
			transformActive = true;
			btn.textContent = 'Remove transform';
		} else if (transformWrapper) {
			transformWrapper.parentElement?.insertBefore(container, transformWrapper);
			transformWrapper.remove();
			transformWrapper = null;
			transformActive = false;
			btn.textContent = 'Transform test';
		}
	});
})();
