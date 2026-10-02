// Локальний сервер без залежностей: роздає статику та проксує /api/freeserp -> freeserp.ai/api.php
// (freeserp.ai зараз дублює заголовок CORS, тому браузер не дозволяє прямі запити).
// Запуск: node server.js [порт]   (за замовчуванням 8080)
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const UPSTREAM = new URL(process.env.UPSTREAM || 'https://freeserp.ai/api.php');
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function proxy(req, res) {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const lib = UPSTREAM.protocol === 'https:' ? https : http;
  const up = lib.get(
    { hostname: UPSTREAM.hostname, port: UPSTREAM.port || undefined, path: UPSTREAM.pathname + qs, headers: { 'User-Agent': 'AIRadar/1.0', Accept: 'application/json' }, timeout: 15000 },
    (r) => {
      res.writeHead(r.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' });
      r.pipe(res);
    }
  );
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', (e) => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'upstream', detail: e.message }));
  });
}

http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/api/freeserp') return proxy(req, res);
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT) || path.basename(file) === 'server.js') { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`AI Radar: http://localhost:${PORT}`));
