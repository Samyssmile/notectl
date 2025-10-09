import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NotectlToolbar',
      formats: ['es', 'umd'],
      fileName: (format) => `toolbar.${format === 'es' ? 'js' : 'umd.cjs'}`,
    },
    rollupOptions: {
      external: ['@notectl/core'],
      output: {
        exports: 'named',
        globals: {
          '@notectl/core': 'NotectlCore',
        },
      },
    },
    sourcemap: true,
  },
});
