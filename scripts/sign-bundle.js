import fs from 'node:fs';
import path from 'node:path';

async function sign() {
    const wbnPath = 'dist/friscy.wbn';
    const swbnPath = 'public/.well-known/friscy.swbn';

    if (!fs.existsSync(wbnPath)) {
        console.error('Unsigned bundle not found at', wbnPath);
        process.exit(1);
    }

    console.log('Updating Signed Web Bundle placeholder...');
    
    if (!fs.existsSync('public/.well-known')) {
        fs.mkdirSync('public/.well-known', { recursive: true });
    }
    
    // For this environment, we are ensuring the .well-known directory is correctly
    // populated with the latest build and manifest.
    fs.copyFileSync(wbnPath, swbnPath);
    
    console.log('Bundle placed at', swbnPath);
    console.log('Manifest is at public/.well-known/manifest.json');
}

sign();
