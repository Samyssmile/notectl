import './style.css';
import {createEditor} from '@notectl/core';
import {createToolbarPlugin} from '@notectl/plugin-toolbar';

// 1. Get container
const host = document.querySelector<HTMLDivElement>('#editor-host')!;

// 2. Create editor
const editor = createEditor(host, {
    placeholder: 'Start typing...',
    autofocus: true,
});

// 3. Add toolbar plugin
const toolbar = createToolbarPlugin({
    position: 'top',
    table: {enabled: true},
});

editor.registerPlugin(toolbar);

// Optional: Listen to events (fully type-safe!)
editor.on('change', (data) => {
    console.log('Content changed:', JSON.stringify(data));
});

