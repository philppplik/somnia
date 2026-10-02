import { build, context } from 'esbuild';
import fs from 'node:fs';
fs.mkdirSync('dist', { recursive: true });
fs.cpSync('public', 'dist', { recursive: true });
const opts = { entryPoints: { app: 'src/app.js' }, bundle: true, outdir: 'dist', minify: true, format: 'iife', loader: { '.css': 'css' }, logLevel: 'info' };
await build(opts);
fs.copyFileSync('src/app.css', 'dist/app.css');
