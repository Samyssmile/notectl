import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        customElement: false,
      },
    }),
    dts({
      include: ['src'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
    }),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'NotectlSvelte',
      formats: ['es', 'umd'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'umd.js'}`,
    },
    rollupOptions: {
      external: ['svelte', 'svelte/internal', '@notectl/core'],
      output: {
        globals: {
          svelte: 'Svelte',
          'svelte/internal': 'SvelteInternal',
          '@notectl/core': 'NotectlCore',
        },
      },
    },
    sourcemap: true,
  },
});
