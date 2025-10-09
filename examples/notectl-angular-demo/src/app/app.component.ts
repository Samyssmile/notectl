import { Component, OnInit, ElementRef, ViewChild, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { NotectlEditor } from '@notectl/core';
import { ToolbarPlugin } from '@notectl/plugin-toolbar';
import { TablePlugin } from '@notectl/plugin-table';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppComponent implements OnInit {
  @ViewChild('editorContainer', { static: true }) editorContainer?: ElementRef;

  title = 'notectl-angular-demo';
  private editor?: NotectlEditor;

  async ngOnInit(): Promise<void> {
    if (this.editorContainer?.nativeElement) {
      try {
        // Create editor instance
        this.editor = document.createElement('notectl-editor') as NotectlEditor;

        // ✅ NEW in v0.0.4: Register plugins BEFORE mounting!
        // Plugins are automatically queued and initialized when editor is mounted
        await this.editor.registerPlugin(new ToolbarPlugin());
        await this.editor.registerPlugin(new TablePlugin());

        // Mount editor - plugins will be initialized automatically
        this.editorContainer.nativeElement.appendChild(this.editor);

        // ✅ NEW in v0.0.4: Use whenReady() for explicit control
        // No more magic setTimeout(100)!
        await this.editor.whenReady();

        // Configure editor
        this.editor.configure({
          placeholder: 'Start typing...'
        });

        // Listen to content changes
        this.editor.on('content-change', (data: any) => {
          console.log('Content changed:', data.content);
        });

        // ✅ NEW in v0.0.4: Listen for ready event
        this.editor.on('ready', () => {
          console.log('Editor is ready!');
        });
      } catch (error) {
        console.error('Error setting up editor:', error);
      }
    }
  }
}
