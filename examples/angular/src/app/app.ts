import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import {
  NotectlEditorComponent,
  type Plugin,
  type FontDefinition,
  type StateChangeEvent,
  type SelectionChangeEvent,
  TextFormattingPlugin,
  StrikethroughPlugin,
  SuperSubPlugin,
  TextColorPlugin,
  HighlightPlugin,
  HeadingPlugin,
  BlockquotePlugin,
  CodeBlockPlugin,
  AlignmentPlugin,
  ListPlugin,
  LinkPlugin,
  TablePlugin,
  HorizontalRulePlugin,
  ImagePlugin,
  HardBreakPlugin,
  FontPlugin,
  FontSizePlugin,
  ThemePreset,
} from '@notectl/angular';
import { STARTER_FONTS } from '@notectl/core/fonts';

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

@Component({
  selector: 'app-root',
  imports: [NotectlEditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly editor = viewChild<NotectlEditorComponent>('editor');

  protected readonly theme = signal<ThemePreset>(ThemePreset.Light);
  protected readonly readonlyMode = signal(false);
  protected readonly output = signal('Click a button above to inspect editor state.');
  protected readonly stateChangeCount = signal(0);
  protected readonly lastEvent = signal('');

  protected readonly isDark = computed(() => this.theme() === ThemePreset.Dark);
  protected readonly themeButtonLabel = computed(() =>
    this.isDark() ? 'Toggle Light Mode' : 'Toggle Dark Mode',
  );

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
    [
      new HeadingPlugin(),
      new BlockquotePlugin(),
      new CodeBlockPlugin({
        keymap: {
          insertAfter: 'Mod-Shift-Enter',
          toggle: 'Mod-Shift-C',
        },
      }),
    ],
    [new AlignmentPlugin()],
    [new ListPlugin()],
    [new LinkPlugin(), new TablePlugin(), new HorizontalRulePlugin(), new ImagePlugin()],
  ];

  protected readonly plugins: Plugin[] = [new HardBreakPlugin()];

  onStateChange(_event: StateChangeEvent): void {
    this.stateChangeCount.update((c) => c + 1);
  }

  onSelectionChange(_event: SelectionChangeEvent): void {
    this.lastEvent.set('selectionChange');
  }

  onFocus(): void {
    this.lastEvent.set('focus');
  }

  onBlur(): void {
    this.lastEvent.set('blur');
  }

  onReady(): void {
    this.output.set('Editor ready!');
  }

  toggleReadonly(): void {
    this.readonlyMode.update((v) => !v);
    this.output.set(`Readonly: ${this.readonlyMode()}`);
  }

  setJSONSample(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    editorRef.setJSON({
      children: [
        {
          id: 'sample-1',
          type: 'paragraph',
          children: [{ type: 'text', text: 'Content set via setJSON', marks: [] }],
        },
      ],
    } as never);
    this.output.set('Content set via setJSON');
  }

  getJSON(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    this.output.set(JSON.stringify(editorRef.getJSON(), null, 2));
  }

  getContentHTML(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    this.output.set(editorRef.getContentHTML());
  }

  getText(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    this.output.set(editorRef.getText() || '(empty)');
  }

  isEmpty(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    this.output.set(`isEmpty: ${editorRef.isEmpty()}`);
  }

  toggleBold(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    editorRef.commands.toggleBold();
    this.output.set('Bold toggled via API');
  }

  undo(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    editorRef.commands.undo();
    this.output.set('Undo executed');
  }

  redo(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    editorRef.commands.redo();
    this.output.set('Redo executed');
  }

  toggleTheme(): void {
    const next = this.isDark() ? ThemePreset.Light : ThemePreset.Dark;
    this.theme.set(next);
    this.output.set(`Theme: ${next}`);
  }
}
