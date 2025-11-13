import './style.css';
import {createEditor} from '@notectl/core';
import {createToolbarPlugin} from '@notectl/plugin-toolbar';

const CUSTOM_FONT_NAME = 'Fira Code';
const CUSTOM_FONT_STACK = `'${CUSTOM_FONT_NAME}', 'Fira Code VF', monospace`;

// 1. Get container
const host = document.querySelector<HTMLDivElement>('#editor-host')!;

// 2. Create editor
const editor = createEditor(host, {
    placeholder: 'Start typing...',
    autofocus: true,
    appearance: {
        fontFamily: CUSTOM_FONT_STACK,
    },
});

// 3. Add toolbar plugin with custom font option
const toolbar = createToolbarPlugin({
    position: 'top',
    table: {enabled: true},
    fonts: {
        families: [
            {
                label: CUSTOM_FONT_NAME,
                value: CUSTOM_FONT_NAME,
            },
        ],
    },
});

editor.registerPlugin(toolbar);

// Optional: Listen to events (fully type-safe!)
editor.on('change', (data) => {
    console.log('Content changed:', JSON.stringify(data));
});
