import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import somniaPreview from './somnia-preview.mjs';
export default defineConfig({plugins:[somniaPreview(),react()]});
