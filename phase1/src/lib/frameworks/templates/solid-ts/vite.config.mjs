import {defineConfig} from 'vite';
import solid from 'vite-plugin-solid';
import somniaPreview from './somnia-preview.mjs';
export default defineConfig({plugins:[somniaPreview(),solid()]});
