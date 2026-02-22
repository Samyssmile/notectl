import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import {
  NotectlEditorComponent,
  type Plugin,
  type FontDefinition,
  type StateChangeEvent,
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
  protected readonly output = signal('Click a button above to inspect editor state.');

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
    // Optionally update output in real-time
  }

  onReady(): void {
    this.output.set('Editor ready!');
  }

  getJSON(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    this.output.set(JSON.stringify(editorRef.getJSON(), null, 2));
  }

  getHTML(): void {
    const editorRef = this.editor();
    if (!editorRef) return;
    this.output.set(editorRef.getHTML());
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
