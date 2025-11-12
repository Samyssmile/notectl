import './style.css';
import {createEditor} from '@notectl/core';
import {createToolbarPlugin, DEFAULT_TOOLBAR_CONFIG} from '@notectl/plugin-toolbar';

const CUSTOM_FONT_NAME = 'Fira Code';
const CUSTOM_FONT_STACK = `'${CUSTOM_FONT_NAME}', 'Fira Code VF', monospace`;

// 1. Get container
const host = document.querySelector<HTMLDivElement>('#editor-host')!;

// 2. Create editor
const editor = createEditor(host, {
    placeholder: 'Start typing...',
    autofocus: true,
});

// Apply custom font to editor host so it overrides the shadow-root default
editor.style.fontFamily = CUSTOM_FONT_STACK;

// 3. Add toolbar plugin with custom font option
const toolbar = createToolbarPlugin({
    position: 'top',
    table: {enabled: true},
    items: DEFAULT_TOOLBAR_CONFIG.items?.map((item) => {
        if (item.id !== 'font-family' || !('options' in item)) {
            return item;
        }

        if (item.options.some((option) => option.value === CUSTOM_FONT_NAME)) {
            return item;
        }

        return {
            ...item,
            options: [
                ...item.options,
                {
                    label: CUSTOM_FONT_NAME,
                    value: CUSTOM_FONT_NAME,
                    command: 'format.fontFamily',
                    args: [CUSTOM_FONT_NAME],
                },
            ],
        };
    }),
});

editor.registerPlugin(toolbar);

// Optional: Listen to events (fully type-safe!)
editor.on('change', (data) => {
    console.log('Content changed:', JSON.stringify(data));
});
