import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't empty when building individual files
    lib: {
      entry: resolve(__dirname, 'src/background/background-main.js'),
      formats: ['es'],
      fileName: () => 'background.js'
    },
    rollupOptions: {
      output: {
        // Inline all dependencies to create a single file
        inlineDynamicImports: true
      }
    },
    target: 'esnext',
    minify: false,
    sourcemap: false
  }
});
