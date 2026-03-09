import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = parseInt(process.argv[2] || '8080', 10);
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
    const finalPath = path.resolve(process.cwd(), safeName);
    fs.writeFileSync(finalPath, body);
    const bytes = fs.statSync(finalPath).size;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: `./${safeName}`, bytes }));
    return true;
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: error && error.message ? error.message : String(error) }));
    return true;
  }
}

async function handleHostFetch(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return true;
  }
  try {
    const body = await readRequestBodyBuffer(req, 32 * 1024 * 1024);
    const payload = JSON.parse(body.toString('utf8') || '{}');
    const url = String(payload.url || '');
    if (!url) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing_url' }));
      return true;
    }

    const options = payload.options && typeof payload.options === 'object' ? payload.options : {};
    const fetchOpts = {};
    if (options.method) fetchOpts.method = String(options.method);
    if (options.headers && typeof options.headers === 'object') fetchOpts.headers = options.headers;
    if (Object.prototype.hasOwnProperty.call(options, 'body') && options.body != null) {
      if (typeof options.body === 'string' || Buffer.isBuffer(options.body)) {
        fetchOpts.body = options.body;
      } else {
        fetchOpts.body = JSON.stringify(options.body);
      }
    }

    const timeoutMs = 15000;
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(new Error('host fetch timeout')), timeoutMs);
    let upstream;
    try {
      upstream = await fetch(url, { ...fetchOpts, signal: ac.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await upstream.text();
    const headers = {};
    upstream.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
      body: text,
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

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // CORS + COOP/COEP for SharedArrayBuffer
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  const pathname = (req.url && req.url.split('?')[0]) || '/';
  if (pathname.startsWith('/__upload_checkpoint/')) {
    handleCheckpointUpload(req, res, pathname);
    return;
  }
  if (pathname === '/__host_fetch') {
    handleHostFetch(req, res);
    return;
  }
  let filePath = '.' + pathname;
  if (filePath === './' || filePath === '.') {
    const hasExample = req.url && req.url.includes('example=');
    filePath = hasExample ? './index.html' : './claude-demo.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
