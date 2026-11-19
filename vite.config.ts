import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// "base" = nome del repository: GitHub Pages serve l'app da /stack-the-rat/
export default defineConfig({
  base: '/stack-the-rat/',
  plugins: [preact()],
});
