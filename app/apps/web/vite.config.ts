import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createReadStream, existsSync } from 'node:fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-higgsfield-pilot-preview',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/higgsfield-pilot-local.png', (req, res, next) => {
          const remote = req.socket.remoteAddress;
          if (!remote || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
            res.statusCode = 403;
            res.end();
            return;
          }
          const file = path.resolve(__dirname, '../../.data/higgsfield-pilot-local.png');
          if (!existsSync(file)) return next();
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'no-store');
          createReadStream(file).pipe(res);
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/assets': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
