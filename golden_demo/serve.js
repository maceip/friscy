import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number.parseInt(process.argv[2] || '9095', 10);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.tar': 'application/x-tar',
  '.ckpt': 'application/octet-stream',
};

function sanitizeUploadName(name) {
  if (!name) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (!name.endsWith('.ckpt')) return null;
  return name;
}

function sanitize(urlPath) {
  const clean = (urlPath || '/').split('?')[0];
  if (clean === '/' || clean === '') return '/golden_demo/index.html';
  return clean;
}

function allowed(resolvedPath) {
  return resolvedPath.startsWith(path.join(ROOT, 'golden_demo') + path.sep)
    || resolvedPath.startsWith(path.join(ROOT, 'docs_site') + path.sep);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  if (req.method === 'POST' && req.url?.startsWith('/__upload_checkpoint/')) {
    const rawName = req.url.slice('/__upload_checkpoint/'.length).split('?')[0];
    const name = sanitizeUploadName(rawName);
    if (!name) {
      res.writeHead(400);
      res.end('bad checkpoint name');
      return;
    }
    const target = path.join(ROOT, 'docs_site', name);
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 512 * 1024 * 1024) {
        req.destroy(new Error('payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(target, buf);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: buf.length, path: `/docs_site/${name}` }));
      } catch (e) {
        res.writeHead(500);
        res.end(`write failed: ${e.message}`);
      }
    });
    req.on('error', (e) => {
      res.writeHead(500);
      res.end(`upload failed: ${e.message}`);
    });
    return;
  }

  const rel = sanitize(req.url);
  if (rel === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const filePath = path.join(ROOT, rel);
  const resolved = path.resolve(filePath);

  if (!allowed(resolved)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`golden_demo server: http://127.0.0.1:${PORT}/`);
  console.log('serving: /golden_demo and /docs_site only');
});
