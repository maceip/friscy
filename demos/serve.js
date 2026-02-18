#!/usr/bin/env node
// Simple static file server with CORS + cross-origin isolation headers
// Serves from current working directory (not __dirname)
// Usage: node serve.js [port]

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || '8080', 10);
const ROOT = process.cwd();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.tar':  'application/x-tar',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      res.writeHead(200);
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Demo server: http://localhost:${PORT}`);
  console.log(`Serving: ${ROOT}`);
});
