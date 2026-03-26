/**
 * esbuild configuration for bundling the client SPA
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/ui/client/app.ts'],
  bundle: true,
  outfile: 'dist/client.js',
  format: 'esm',
  target: 'es2022',
  minify: process.argv.includes('--minify'),
  sourcemap: true,
  alias: {
    'react': 'preact/compat',
    'react-dom': 'preact/compat',
  },
});

console.log('Client bundle built: dist/client.js');
