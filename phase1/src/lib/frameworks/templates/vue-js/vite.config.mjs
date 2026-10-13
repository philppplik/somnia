import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import somniaPreview from './somnia-preview.mjs';
export default defineConfig({plugins:[somniaPreview(),vue()]});
