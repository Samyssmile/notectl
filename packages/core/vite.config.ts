import { resolve } from 'node:path';
import terser from '@rollup/plugin-terser';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const pluginEntries: Record<string, string> = {
	'plugins/text-formatting': resolve(__dirname, 'src/plugins/text-formatting/index.ts'),
	'plugins/heading': resolve(__dirname, 'src/plugins/heading/index.ts'),
	'plugins/toolbar': resolve(__dirname, 'src/plugins/toolbar/index.ts'),
	'plugins/table': resolve(__dirname, 'src/plugins/table/index.ts'),
	'plugins/image': resolve(__dirname, 'src/plugins/image/index.ts'),
	'plugins/code-block': resolve(__dirname, 'src/plugins/code-block/index.ts'),
	'plugins/link': resolve(__dirname, 'src/plugins/link/index.ts'),
	'plugins/list': resolve(__dirname, 'src/plugins/list/index.ts'),
	'plugins/blockquote': resolve(__dirname, 'src/plugins/blockquote/index.ts'),
	'plugins/strikethrough': resolve(__dirname, 'src/plugins/strikethrough/index.ts'),
	'plugins/text-color': resolve(__dirname, 'src/plugins/text-color/index.ts'),
	'plugins/horizontal-rule': resolve(__dirname, 'src/plugins/horizontal-rule/index.ts'),
	'plugins/alignment': resolve(__dirname, 'src/plugins/alignment/index.ts'),
	'plugins/font': resolve(__dirname, 'src/plugins/font/index.ts'),
	'plugins/font-size': resolve(__dirname, 'src/plugins/font-size/index.ts'),
	'plugins/highlight': resolve(__dirname, 'src/plugins/highlight/index.ts'),
	'plugins/super-sub': resolve(__dirname, 'src/plugins/super-sub/index.ts'),
	'plugins/hard-break': resolve(__dirname, 'src/plugins/hard-break/index.ts'),
	'plugins/gap-cursor': resolve(__dirname, 'src/plugins/gap-cursor/index.ts'),
};

export default defineConfig({
	plugins: [
		dts({
			insertTypesEntry: false,
			rollupTypes: false,
			outDir: 'dist',
		}),
	],
	build: {
		lib: {
			entry: {
				'notectl-core': resolve(__dirname, 'src/index.ts'),
				fonts: resolve(__dirname, 'src/fonts.ts'),
				...pluginEntries,
			},
			formats: ['es'],
		},
		rollupOptions: {
			external: ['dompurify'],
			output: {
				globals: {
					dompurify: 'DOMPurify',
				},
				entryFileNames: '[name].mjs',
				chunkFileNames: 'chunks/[name]-[hash].mjs',
			},
			plugins: [
				terser({
					compress: { passes: 2 },
				}),
			],
		},
		sourcemap: true,
		minify: false,
	},
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
		},
	},
});
