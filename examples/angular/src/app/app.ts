import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  NotectlEditorComponent,
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
  STARTER_FONTS,
  ThemePreset,
} from '@notectl/angular';
import type { Plugin } from '@notectl/angular';

@Component({
  selector: 'app-root',
  imports: [NotectlEditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly title = signal('notectl Angular Example');
  protected readonly theme = signal<ThemePreset>(ThemePreset.Light);

  protected readonly toolbar: ReadonlyArray<ReadonlyArray<Plugin>> = [
    [
      new FontPlugin({ fonts: [...STARTER_FONTS] }),
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
}
