# @notectl/angular

Angular adapter for NotectlEditor - a framework-agnostic rich text editor built on Web Components.

## Installation

```bash
npm install @notectl/angular @notectl/core
```

## Usage

### Import Module

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { NotectlEditorModule } from '@notectl/angular';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    NotectlEditorModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

### Component Usage

```typescript
import { Component } from '@angular/core';
import type { EditorAPI } from '@notectl/core';

@Component({
  selector: 'app-root',
  template: `
    <notectl-editor
      [content]="content"
      [placeholder]="'Start writing...'"
      [readOnly]="false"
      (contentChange)="onContentChange($event)"
      (ready)="onReady($event)"
    ></notectl-editor>
  `
})
export class AppComponent {
  content = { type: 'doc', content: [] };

  onContentChange(content: unknown): void {
    console.log('Content changed:', content);
  }

  onReady(editor: EditorAPI): void {
    console.log('Editor ready:', editor);
  }
}
```

### Reactive Forms Integration

```typescript
import { Component } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-editor-form',
  template: `
    <form [formGroup]="form">
      <notectl-editor formControlName="content"></notectl-editor>
    </form>
  `
})
export class EditorFormComponent {
  form = new FormGroup({
    content: new FormControl(null)
  });
}
```

### Directive Usage

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-editor',
  template: `
    <div
      notectl-editor
      [content]="content"
      (contentChange)="onContentChange($event)"
    ></div>
  `
})
export class EditorComponent {
  content = { type: 'doc', content: [] };

  onContentChange(content: unknown): void {
    console.log('Content changed:', content);
  }
}
```

## API

### Component Props

- `debug?: boolean` - Enable debug mode
- `content?: string | object` - Initial editor content
- `placeholder?: string` - Placeholder text
- `readOnly?: boolean` - Read-only mode
- `accessibility?: object` - Accessibility configuration
- `i18n?: object` - Internationalization settings
- `theme?: object` - Theme configuration

### Component Events

- `contentChange: EventEmitter<unknown>` - Emitted when content changes
- `selectionChange: EventEmitter<unknown>` - Emitted when selection changes
- `editorFocus: EventEmitter<void>` - Emitted when editor gains focus
- `editorBlur: EventEmitter<void>` - Emitted when editor loses focus
- `ready: EventEmitter<EditorAPI>` - Emitted when editor is ready
- `error: EventEmitter<Error>` - Emitted when an error occurs

### Component Methods

- `getContent(): unknown` - Get current content
- `setContent(content: unknown): void` - Set content
- `getState(): unknown` - Get editor state
- `executeCommand(command: string, ...args: unknown[]): void` - Execute command
- `registerPlugin(plugin: unknown): void` - Register a plugin
- `unregisterPlugin(pluginId: string): void` - Unregister a plugin

## License

MIT
