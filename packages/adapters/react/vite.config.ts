import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NotectlReact',
      formats: ['es', 'umd'],
      fileName: (format) => `react.${format === 'es' ? 'js' : 'umd.cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@notectl/core'],
      output: {
        exports: 'named',
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          '@notectl/core': 'NotectlCore',
        },
      },
    },
    sourcemap: true,
  },
});
