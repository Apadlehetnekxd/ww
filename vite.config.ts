import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { Readable } from 'node:stream';
import { readFileSync, existsSync } from 'node:fs';
import { handleVisionRequest, type VisionEnvironment } from './server/vision-handler';
import { handleTtsRequest } from './server/tts-handler';
import { visionEnvironment } from './server/vision-env';

function localApi(path: string, handle: (request: Request, env: VisionEnvironment) => Promise<Response>, env: VisionEnvironment): Plugin {
  return {
    name: `neurix${path.replace(/\W+/g, '-')}`,
    configureServer(server) {
      server.middlewares.use(path, async (req, res) => {
        const controller = new AbortController();
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        try {
          const protocol = server.config.server.https ? 'https' : 'http';
          const method = req.method || 'GET';
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
          }
          const options: RequestInit & { duplex?: string } = { method, headers, signal: controller.signal };
          if (method !== 'GET' && method !== 'HEAD') {
            options.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
            options.duplex = 'half';
          }
          const response = await handle(new Request(`${protocol}://${req.headers.host}${path}`, options), env);
          res.writeHead(response.status, Object.fromEntries(response.headers));
          const audio = await response.arrayBuffer();
          res.end(Buffer.from(audio));
        } catch {
          if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'The local API could not process this request.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const phone = mode === 'phone';
  if (phone && !existsSync('.local/https.json')) throw new Error('Run npm run setup:phone first to create the local HTTPS certificate.');
  const https = phone ? JSON.parse(readFileSync('.local/https.json', 'utf8')) as { pfx: string; passphrase: string } : null;
  return {
    plugins: [
      TanStackRouterVite({ autoCodeSplitting: true }),
      react(), tailwindcss(), tsconfigPaths(),
      localApi('/api/vision', handleVisionRequest, visionEnvironment(env)),
      localApi('/api/tts', handleTtsRequest, visionEnvironment(env)),
    ],
    server: {
      host: '0.0.0.0', port: phone ? 3443 : 3000, strictPort: true,
      ...(https ? { https: { pfx: readFileSync(https.pfx), passphrase: https.passphrase } } : {}),
      fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,pfx}', '**/.git/**', '**/.local/**'] },
      proxy: { '/api/nvidia': { target: 'https://integrate.api.nvidia.com', changeOrigin: true, secure: true, rewrite: (path: string) => path.replace(/^\/api\/nvidia/, '') } },
    },
    preview: { host: '0.0.0.0' },
  };
});
