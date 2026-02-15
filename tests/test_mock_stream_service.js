#!/usr/bin/env node
import { startMockStreamService } from './mock/mock_stream_service.js';

async function main() {
    let service = null;
    try {
        service = await startMockStreamService({ port: 0, apiKey: 'mock-stream-key' });
        const res = await fetch(service.streamUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': service.apiKey,
            },
            body: JSON.stringify({ prompt: 'healthcheck prompt' }),
        });
        if (!res.ok) {
            throw new Error(`unexpected status: ${res.status}`);
        }
        const body = await res.text();
        if (!body.includes('mock-stream-complete')) {
            throw new Error('missing streaming completion signature');
        }
        if (!body.includes('"done":true')) {
            throw new Error('missing done marker');
        }
        console.log('[PASS] mock stream service emits SSE completion payload');
        return 0;
    } finally {
        if (service) {
            await service.close();
        }
    }
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
