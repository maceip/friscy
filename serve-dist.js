import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9090;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.tar': 'application/x-tar',
    '.wbn': 'application/webbundle',
};

const server = http.createServer((req, res) => {
    // 1. Mandatory Isolation Headers for SharedArrayBuffer
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    
    // 2. CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    let urlPath = req.url.split('?')[0];
    let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);
    
    if (!filePath.startsWith(DIST_DIR)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // SPA fallback: Serve index.html for unknown routes
                fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, data2) => {
                    if (err2) {
                        res.statusCode = 404;
                        res.end('Not Found');
                    } else {
                        res.setHeader('Content-Type', 'text/html');
                        res.end(data2);
                    }
                });
            } else {
                res.statusCode = 500;
                res.end('Internal Server Error');
            }
        } else {
            res.setHeader('Content-Type', contentType);
            res.end(data);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Cross-Origin Isolation (COOP/COEP) ACTIVE');
});
