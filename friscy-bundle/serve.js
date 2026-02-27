import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = parseInt(process.argv[2] || '8080', 10);
const BASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_PROXY_BODY = 8 * 1024 * 1024;
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm',
  '.tar': 'application/x-tar',
};

function readRequestBody(req, maxBytes = MAX_PROXY_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readRequestBodyBuffer(req, maxBytes = 512 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleHostFetchProxy(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    });
    res.end();
    return true;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return true;
  }

  try {
    const bodyText = await readRequestBody(req);
    const payload = JSON.parse(bodyText || '{}');
    const url = String(payload.url || '');
    const options = payload.options && typeof payload.options === 'object' ? payload.options : {};

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_url' }));
      return true;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unsupported_protocol' }));
      return true;
    }

    const fetchOptions = {};
    if (options.method) fetchOptions.method = String(options.method);
    if (options.headers && typeof options.headers === 'object') fetchOptions.headers = options.headers;
    if (Object.prototype.hasOwnProperty.call(options, 'body')) fetchOptions.body = options.body;

    const upstream = await fetch(url, fetchOptions);
    const responseBody = await upstream.text();
    const responseHeaders = {};
    upstream.headers.forEach((v, k) => { responseHeaders[k] = v; });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
      body: responseBody,
    }));
    return true;
  } catch (error) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 0,
      statusText: error && error.message ? error.message : String(error),
      headers: {},
      body: '',
    }));
    return true;
  }
}

async function handleCheckpointUpload(req, res, pathname) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return true;
  }

  const encodedName = pathname.slice('/__upload_checkpoint/'.length);
  const decoded = decodeURIComponent(encodedName || '').trim();
  const safeName = path.basename(decoded || 'uploaded.ckpt');
  if (!safeName || !safeName.endsWith('.ckpt')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_checkpoint_name' }));
    return true;
  }

  try {
    const body = await readRequestBodyBuffer(req);
    fs.writeFileSync(path.join(BASE_DIR, safeName), body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: `./${safeName}`, bytes: body.length }));
    return true;
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: error && error.message ? error.message : String(error) }));
    return true;
  }
}

const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  // CORS + COOP/COEP for SharedArrayBuffer
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  const pathname = (req.url && req.url.split('?')[0]) || '/';

  if (pathname === '/__vhfetch') {
    await handleHostFetchProxy(req, res);
    return;
  }
  if (pathname.startsWith('/__upload_checkpoint/')) {
    await handleCheckpointUpload(req, res, pathname);
    return;
  }

  let filePath = '.' + pathname;
  if (filePath === './' || filePath === '.') {
    const hasExample = req.url && req.url.includes('example=');
    filePath = hasExample ? './index.html' : './claude-demo.html';
  }

  const filePathAbs = path.resolve(BASE_DIR, filePath.slice(2));
  if (!filePathAbs.startsWith(BASE_DIR + path.sep) && filePathAbs !== BASE_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const extname = String(path.extname(filePathAbs)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePathAbs, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
