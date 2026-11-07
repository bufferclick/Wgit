import { defineConfig } from 'vite';
import { Readable } from 'node:stream';
import { onRequest } from './functions/api/git/[[path]].js';

// Use the same restricted relay locally that Cloudflare Pages runs in production.
function gitRelay() {
  const middleware = (req, res, next) => {
    if (!req.url.startsWith('/api/git/')) return next();
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const origin = `${protocol}://${req.headers.host}`;
    const init = { method: req.method, headers: req.headers };
    if (!['GET', 'HEAD'].includes(req.method)) { init.body = Readable.toWeb(req); init.duplex = 'half'; }
    onRequest({ request: new Request(new URL(req.url, origin), init) }).then(response => {
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
    }).catch(() => { res.writeHead(500); res.end('Git relay error.'); });
  };
  return { name: 'wgit-github-relay', configureServer: server => { server.middlewares.use(middleware); }, configurePreviewServer: server => { server.middlewares.use(middleware); } };
}
export default defineConfig({
  plugins: [gitRelay()],
  resolve: { alias: { buffer: 'buffer/' } },
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
});
