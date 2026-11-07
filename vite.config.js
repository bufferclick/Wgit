import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { alias: { buffer: 'buffer/' } },
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
});
