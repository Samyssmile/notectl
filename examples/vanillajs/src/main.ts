import './style.css';
import type {FontManifest} from '@notectl/core';
import {createEditor} from '@notectl/core';
import {createToolbarPlugin} from '@notectl/plugin-toolbar';
import fontManifestJson from './fonts.json';

const fontManifest: FontManifest = fontManifestJson;

const CUSTOM_FONT_NAME = 'Fira Code';
const CUSTOM_FONT_STACK = `'${CUSTOM_FONT_NAME}', 'Fira Code VF', monospace`;

// 1. Get container
const host = document.querySelector<HTMLDivElement>('#editor-host')!;

// 2. Create editor
const editor = createEditor(host, {
    placeholder: 'Start typing...',
    autofocus: true,
    fonts: fontManifest,
    appearance: {
        fontFamily: CUSTOM_FONT_STACK,
    },
});

// 3. Add toolbar plugin with custom font option
const toolbar = createToolbarPlugin({
    position: 'top',
    table: {enabled: true},
    fonts: {
        families: fontManifest.fonts.map((font) => ({
            label: font.label ?? font.family,
            value: font.family,
        })),
    },
});

editor.registerPlugin(toolbar);

// Optional: Listen to events (fully type-safe!)
editor.on('change', (data) => {
    console.log('Content changed:', JSON.stringify(data));
});
