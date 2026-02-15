#!/usr/bin/env node
import http from 'http';

function readJsonBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => {
            if (chunks.length === 0) {
                resolve({});
                return;
            }
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                resolve(parsed && typeof parsed === 'object' ? parsed : {});
            } catch {
                resolve({});
            }
        });
        req.on('error', () => resolve({}));
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startMockStreamService(options = {}) {
    const expectedApiKey = options.apiKey || 'mock-stream-key';
    const chunkDelayMs = Number.isFinite(options.chunkDelayMs) ? options.chunkDelayMs : 80;
    const host = options.host || '127.0.0.1';
    const port = Number.isInteger(options.port) ? options.port : 0;

    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/healthz') {
            res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('ok');
            return;
        }

        if (req.method !== 'POST' || req.url !== '/v1/stream') {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'not_found' }));
            return;
        }

        const apiKey = req.headers['x-api-key'];
        if (apiKey !== expectedApiKey) {
            res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'unauthorized' }));
            return;
        }

        const payload = await readJsonBody(req);
        const prompt = String(payload.prompt || 'unknown prompt');
        const tokens = [
            'Mock',
            'stream',
            'for',
            'prompt:',
            prompt,
            '\nline one',
            '\nline two',
            '\nline three',
            '\nmock-stream-complete',
        ];

        res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'x-mock-service': 'friscy-stream-v1',
        });

        for (const token of tokens) {
            res.write(`event: delta\ndata: ${JSON.stringify({ delta: token })}\n\n`);
            await wait(chunkDelayMs);
        }
        res.write(`event: done\ndata: ${JSON.stringify({ done: true, signature: 'mock-stream-complete' })}\n\n`);
        res.end();
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });

    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const baseUrl = `http://${host}:${actualPort}`;
    return {
        server,
        apiKey: expectedApiKey,
        baseUrl,
        streamUrl: `${baseUrl}/v1/stream`,
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
    };
}
