import {defineConfig} from 'vite';
// Isolated boundary harness. It does not start the app or require craft WASM.
export default defineConfig({server:{port:1420,strictPort:true},clearScreen:false});
