import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
	AlignmentPlugin,
	BlockquotePlugin,
	CodeBlockPlugin,
	FontPlugin,
	FontSizePlugin,
	HardBreakPlugin,
	HeadingPlugin,
	HighlightPlugin,
	HorizontalRulePlugin,
	ImagePlugin,
	LinkPlugin,
	ListPlugin,
	NotectlEditorComponent,
	STARTER_FONTS,
	StrikethroughPlugin,
	SuperSubPlugin,
	TablePlugin,
	TextColorPlugin,
	TextFormattingPlugin,
	ThemePreset,
} from '@notectl/angular';
import type {
	EditorState,
	FontDefinition,
	Plugin,
	StateChangeEvent,
	Transaction,
} from '@notectl/angular';

import { StateInspectorComponent } from './state-inspector/state-inspector';

const INTER: FontDefinition = {
	name: 'Inter',
	family: "'Inter', sans-serif",
	category: 'sans-serif',
	fontFaces: [
		{
			src: "url('https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.woff2') format('woff2')",
			weight: '100 900',
			style: 'normal',
		},
	],
};

@Component({
	selector: 'app-root',
	imports: [NotectlEditorComponent, StateInspectorComponent],
	templateUrl: './app.html',
	styleUrl: './app.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
	protected readonly title = signal('notectl Angular Example');
	protected readonly theme = signal<ThemePreset>(ThemePreset.Light);

	protected readonly currentState = signal<EditorState | null>(null);
	protected readonly lastTransaction = signal<Transaction | null>(null);
	protected readonly transactionCount = signal(0);

	protected readonly toolbar: ReadonlyArray<ReadonlyArray<Plugin>> = [
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
		[new HeadingPlugin(), new BlockquotePlugin(), new CodeBlockPlugin()],
		[new AlignmentPlugin()],
		[new ListPlugin()],
		[new LinkPlugin(), new TablePlugin(), new HorizontalRulePlugin(), new ImagePlugin()],
	];

	protected readonly plugins: Plugin[] = [new HardBreakPlugin()];

	protected onStateChange(event: StateChangeEvent): void {
		this.currentState.set(event.newState);
		this.lastTransaction.set(event.transaction);
		this.transactionCount.update((count) => count + 1);
	}
}
