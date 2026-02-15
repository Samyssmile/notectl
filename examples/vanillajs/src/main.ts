import {
	BlockquotePlugin,
	FontPlugin,
	FontSizePlugin,
	HeadingPlugin,
	HighlightPlugin,
	HorizontalRulePlugin,
	ImagePlugin,
	LinkPlugin,
	ListPlugin,
	STARTER_FONTS,
	StrikethroughPlugin,
	SuperSubPlugin,
	TablePlugin,
	TextAlignmentPlugin,
	TextColorPlugin,
	TextFormattingPlugin,
	ToolbarPlugin,
	createEditor,
} from '@notectl/core';
import type { FontDefinition, StateChangeEvent } from '@notectl/core';

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
		TextAlignmentPlugin: typeof TextAlignmentPlugin;
		ListPlugin: typeof ListPlugin;
		LinkPlugin: typeof LinkPlugin;
		TablePlugin: typeof TablePlugin;
		HorizontalRulePlugin: typeof HorizontalRulePlugin;
		ImagePlugin: typeof ImagePlugin;
	}
}

// -- Custom font example: Inter (variable font served from public/fonts/) --
const INTER: FontDefinition = {
	name: 'Inter',
	family: "'Inter', sans-serif",
	category: 'sans-serif',
	fontFaces: [
		{
			src: "url('/fonts/Inter-Variable.ttf') format('truetype')",
			weight: '100 900',
			style: 'normal',
		},
		{
			src: "url('/fonts/Inter-Italic-Variable.ttf') format('truetype')",
			weight: '100 900',
			style: 'italic',
		},
	],
};

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
window.TextAlignmentPlugin = TextAlignmentPlugin;
window.ListPlugin = ListPlugin;
window.LinkPlugin = LinkPlugin;
window.TablePlugin = TablePlugin;
window.HorizontalRulePlugin = HorizontalRulePlugin;
window.ImagePlugin = ImagePlugin;

const container = document.getElementById('editor-container') as HTMLElement;
const output = document.getElementById('output') as HTMLElement;

(async () => {
	const editor = await createEditor({
		toolbar: [
			[
				new FontPlugin({ fonts: [...STARTER_FONTS, INTER] }),
				new FontSizePlugin({ sizes: [12, 16, 24, 32, 48], defaultSize: 12 }),
			],
			[
				new TextFormattingPlugin({ bold: true, italic: true, underline: true }),
				new StrikethroughPlugin(),
				new SuperSubPlugin(),
			],
			[new TextColorPlugin(), new HighlightPlugin()],
			[new HeadingPlugin(), new BlockquotePlugin()],
			[new TextAlignmentPlugin()],
			[new ListPlugin()],
			[new LinkPlugin(), new TablePlugin(), new HorizontalRulePlugin(), new ImagePlugin()],
		],
		placeholder: 'Start typing...',
		autofocus: true,
	});

	container.appendChild(editor);

	// Event listeners
	editor.on('stateChange', ({ newState }: StateChangeEvent) => {
		// Optionally update output in real-time
	});

	editor.on('ready', () => {
		output.textContent = 'Editor ready!';
	});

	// Control buttons
	document.getElementById('btn-get-json')?.addEventListener('click', () => {
		output.textContent = JSON.stringify(editor.getJSON(), null, 2);
	});

	document.getElementById('btn-get-html')?.addEventListener('click', () => {
		output.textContent = editor.getHTML();
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
})();
