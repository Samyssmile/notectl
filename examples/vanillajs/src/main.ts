import { ThemePreset, createEditor } from '@notectl/core';
import type { StateChangeEvent } from '@notectl/core';
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
const output = document.getElementById('output') as HTMLElement;

(async () => {
	const preset = createFullPreset({
		font: { fonts: STARTER_FONTS },
		list: { interactiveCheckboxes: true },
		codeBlock: {
			keymap: { insertAfter: 'Mod-Shift-Enter', toggle: 'Mod-Shift-C' },
		},
	});

	const editor = await createEditor({
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

	// Event listeners
	editor.on('stateChange', ({ newState }: StateChangeEvent) => {
		// Optionally update output in real-time
		console.debug('stateChange', newState);
	});

	editor.on('ready', () => {
		output.textContent = 'Editor ready!';
	});

	// Control buttons
	document.getElementById('btn-get-json')?.addEventListener('click', () => {
		output.textContent = JSON.stringify(editor.getJSON(), null, 2);
	});

	document.getElementById('btn-get-html')?.addEventListener('click', async () => {
		output.textContent = await editor.getContentHTML({ pretty: true });
	});

	document.getElementById('btn-get-css-html')?.addEventListener('click', async () => {
		const result = await editor.getContentHTML({ cssMode: 'classes', pretty: true });
		output.textContent = `/* === CSS === */\n${result.css}\n\n/* === HTML === */\n${result.html}`;
	});

	document.getElementById('btn-get-text')?.addEventListener('click', () => {
		output.textContent = editor.getText() || '(empty)';
	});

	document.getElementById('btn-is-empty')?.addEventListener('click', () => {
		output.textContent = `isEmpty: ${editor.isEmpty()}`;
	});

	document.getElementById('btn-toggle-bold')?.addEventListener('click', () => {
		editor.commands.toggleBold();
		output.textContent = 'Bold toggled via API';
	});

	document.getElementById('btn-undo')?.addEventListener('click', () => {
		editor.commands.undo();
		output.textContent = 'Undo executed';
	});

	document.getElementById('btn-redo')?.addEventListener('click', () => {
		editor.commands.redo();
		output.textContent = 'Redo executed';
	});

	// Transform container toggle (for testing bug #72)
	let transformActive = false;
	let transformWrapper: HTMLDivElement | null = null;
	document.getElementById('btn-toggle-transform')?.addEventListener('click', () => {
		const btn = document.getElementById('btn-toggle-transform') as HTMLButtonElement;
		if (!transformActive) {
			transformWrapper = document.createElement('div');
			transformWrapper.style.cssText =
				'transform: translateY(0); padding: 20px; margin-top: 40px; border: 2px dashed red; border-radius: 8px; position: relative;';
			const label = document.createElement('div');
			label.textContent = 'transform: translateY(0) — dropdowns should still align correctly';
			label.style.cssText = 'color: red; font-size: 12px; margin-bottom: 8px; font-weight: 600;';
			transformWrapper.appendChild(label);
			container.parentElement?.insertBefore(transformWrapper, container);
			transformWrapper.appendChild(container);
			transformActive = true;
			btn.textContent = 'Remove Transform Container';
			btn.style.background = '#e0ffe0';
		} else if (transformWrapper) {
			transformWrapper.parentElement?.insertBefore(container, transformWrapper);
			transformWrapper.remove();
			transformWrapper = null;
			transformActive = false;
			btn.textContent = 'Toggle Transform Container (Bug #72 test)';
			btn.style.background = '#ffe0e0';
		}
	});

	// Theme toggle
	const themeBtn: HTMLButtonElement = document.createElement('button');
	themeBtn.textContent = 'Toggle Dark Mode';
	themeBtn.style.cssText = 'margin-top:8px;padding:6px 12px;cursor:pointer;';
	themeBtn.addEventListener('click', () => {
		const current = editor.getTheme();
		const next = current === ThemePreset.Dark ? ThemePreset.Light : ThemePreset.Dark;
		editor.setTheme(next);
		themeBtn.textContent = next === ThemePreset.Dark ? 'Toggle Light Mode' : 'Toggle Dark Mode';
		output.textContent = `Theme: ${next}`;
	});
	container.parentElement?.insertBefore(themeBtn, container.nextSibling);
})();
