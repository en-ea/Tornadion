import { defineConfig } from 'vite';

// host: true exposes the dev server on the LAN so a phone on the same Wi-Fi can connect.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
