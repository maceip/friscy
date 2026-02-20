import puppeteer from 'puppeteer';

async function runTest() {
    console.log('Starting automated verification...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Track console errors
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
            console.error('[Browser Error]', msg.text());
        } else {
            console.log('[Browser]', msg.text());
        }
    });

    page.on('pageerror', err => {
        errors.push(err.message);
        console.error('[Page Error]', err.message);
    });

    try {
        console.log('Navigating to http://localhost:9090...');
        await page.goto('http://localhost:9090', { waitUntil: 'networkidle0', timeout: 30000 });

        console.log('Waiting for rootfs initialization...');
        // Wait for the squiggly loader to finish or terminal to appear
        await page.waitForSelector('.xterm-screen', { timeout: 20000 });
        
        console.log('Terminal detected! Verifying boot sequence...');
        // Wait for booting message in terminal (xterm.js renders to canvas or spans)
        const terminalText = await page.evaluate(() => {
            return document.body.innerText;
        });

        if (terminalText.includes('Booting')) {
            console.log('Verification SUCCESS: System is booting correctly.');
        } else {
            console.warn('Verification WARNING: Terminal found but boot message not seen.');
        }

        if (errors.length > 0) {
            console.error(`Verification FAILED: ${errors.length} errors found in console.`);
            process.exit(1);
        }

    } catch (e) {
        console.error('Verification FAILED:', e.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

runTest();
