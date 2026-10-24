import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import somniaPreview from './somnia-preview.mjs';
export default defineConfig({plugins:[somniaPreview(),svelte()]});
