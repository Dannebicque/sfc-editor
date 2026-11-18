import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Développement avec comptes : `VITE_ACCOUNTS=1 pnpm dev` + serveur sur 8787 (voir apps/server/README.md).
// L'éditeur et l'API partagent ainsi la même origine, donc les cookies de session fonctionnent sans CORS.
const api = process.env.API_TARGET ?? 'http://127.0.0.1:8787';
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: { target: 'es2022' },
  server: { proxy: { '/api': { target: api }, '/ws': { target: api, ws: true } } },
});
