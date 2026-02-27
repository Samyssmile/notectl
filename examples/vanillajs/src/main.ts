import {
	AlignmentPlugin,
	BlockquotePlugin,
	FontPlugin,
	FontSizePlugin,
	HeadingPlugin,
	HighlightPlugin,
	HorizontalRulePlugin,
	ImagePlugin,
	LinkPlugin,
	ListPlugin,
	StrikethroughPlugin,
	SuperSubPlugin,
	TablePlugin,
	TextColorPlugin,
	TextFormattingPlugin,
	ThemePreset,
	ToolbarPlugin,
	createEditor,
	createFullPreset,
} from '@notectl/core';
import type { StateChangeEvent } from '@notectl/core';

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
	const editor = await createEditor({
		...createFullPreset({
			list: { interactiveCheckboxes: true },
			codeBlock: {
				keymap: { insertAfter: 'Mod-Shift-Enter', toggle: 'Mod-Shift-C' },
			},
		}),
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

	document.getElementById('btn-get-html')?.addEventListener('click', () => {
		output.textContent = editor.getHTML({ pretty: true });
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
