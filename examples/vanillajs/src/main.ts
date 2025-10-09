import './style.css';
import type { EditorEventCallback, EditorConfig } from '@notectl/core';
import { createEditor, NotectlEditor } from '@notectl/core';
import { createToolbarPlugin } from '@notectl/plugin-toolbar';
import { createTablePlugin } from '@notectl/plugin-table';

const host = document.querySelector<HTMLDivElement>('#editor-host');
const logOutput = document.querySelector<HTMLPreElement>('#event-log');

if (!host || !logOutput) {
  throw new Error('Missing #editor-host or #event-log element.');
}

const editorConfig: EditorConfig = {
  placeholder: 'Write meeting notes, brainstorm, or insert a table…',
  autofocus: true,
};

const editor = createEditor(host, editorConfig) as NotectlEditor;

// Initialise the editor document via JSON so internal state and DOM stay in sync.
const initialDocVersion = editor.getState().getVersion();
editor.setJSON({
  version: initialDocVersion + 1,
  schemaVersion: '1.0.0',
  children: [
    {
      id: crypto.randomUUID(),
      type: 'heading',
      attrs: { level: 2 },
      children: [
        { type: 'text', text: 'Welcome to Notectl', marks: [] },
      ],
    },
    {
      id: crypto.randomUUID(),
      type: 'paragraph',
      children: [
        {
          type: 'text',
          text: 'This vanilla setup wires the toolbar and table plugins together. Try formatting text, insert a table, or right-click a cell to inspect the context menu.',
          marks: [],
        },
      ],
    },
  ],
});

const toolbarPlugin = createToolbarPlugin({
  position: 'top',
  sticky: true,
});

const tablePlugin = createTablePlugin({
  defaultRows: 3,
  defaultCols: 4,
  allowMerge: true,
  allowSplit: true,
});

async function bootstrap() {
  await editor.registerPlugin(toolbarPlugin);
  await editor.registerPlugin(tablePlugin);

  // Log interesting editor + plugin events so developers can see the integration points.
  const log = (event: string, payload?: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const serialized = payload ? JSON.stringify(payload, null, 2) : '';
    const entry = `[${timestamp}] ${event}${serialized ? `\n${serialized}` : ''}`;

    const lines = [entry, logOutput.textContent].filter(Boolean).join('\n\n');
    // Keep output manageable by trimming after ~10 entries.
    logOutput.textContent = lines.split('\n\n').slice(0, 10).join('\n\n');
  };

  const register = (event: string, handler: EditorEventCallback) => {
    editor.on(event as any, handler);
    return () => editor.off(event as any, handler);
  };

  const subscriptions = [
    register('change', data => log('change', data)),
    register('table:inserted', data => log('table:inserted', data)),
    register('table:row-inserted', data => log('table:row-inserted', data)),
    register('table:column-inserted', data => log('table:column-inserted', data)),
    register('table:command-error', data => log('table:command-error', data)),
  ];

  // Expose editor + teardown hook for quick experimentation in the console.
  Object.assign(window, {
    notectl: {
      editor,
      destroy: () => {
        subscriptions.forEach(unsub => unsub());
        log('destroyed', { reason: 'manual teardown' });
      },
    },
  });

  log('ready', { version: editor.constructor.name, plugins: ['@notectl/plugin-toolbar', '@notectl/plugin-table'] });
}

bootstrap().catch(error => {
  console.error('Failed to start Notectl demo', error);
  logOutput.textContent = `Bootstrap error: ${error instanceof Error ? error.message : String(error)}`;
});

declare global {
  interface Window {
    notectl?: {
      editor: NotectlEditor;
      destroy: () => void;
    };
  }
}
