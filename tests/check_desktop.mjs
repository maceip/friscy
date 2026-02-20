import puppeteer from 'puppeteer';

async function test() {
    console.log('[test] Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-features=SharedArrayBuffer'],
    });

    const page = await browser.newPage();
    
    page.on('dialog', async dialog => {
        console.log(`[test] Dialog appeared: ${dialog.message()}`);
        await dialog.dismiss();
    });
    
    // Log all console messages from the page
    page.on('console', msg => console.log(`[browser] ${msg.text()}`));
    page.on('pageerror', err => console.error(`[browser-error] ${err.message}`));
    page.on('request', request => {
        if (request.url().includes('main.tsx')) {
            console.log(`[test] Requesting: ${request.url()}`);
        }
    });
    page.on('requestfailed', request => {
        if (request.url().includes('main.tsx')) {
            console.error(`[test] Request FAILED: ${request.url()} - ${request.failure().errorText}`);
        }
    });
    page.on('response', response => {
        if (response.url().includes('main.tsx')) {
            console.log(`[test] Response: ${response.url()} - ${response.status()}`);
        }
    });

    console.log('[test] Navigating to http://localhost:5180 ...');
    try {
        await page.goto('http://localhost:5180', { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (e) {
        console.error('[test] Navigation failed. Is the dev server running on 5180?');
        await browser.close();
        process.exit(1);
    }

    // Wait a bit more for React to settle
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'tests/debug_desktop.png' });
    console.log('[test] Screenshot saved to tests/debug_desktop.png');

    console.log('[test] Checking for multiple windows...');
    const result = await page.evaluate(() => {
        const allTestIds = Array.from(document.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid'));
        const windows = document.querySelectorAll('[data-testid^="window-"]');
        const xterms = document.querySelectorAll('.xterm');
        const rootHtml = document.getElementById('root')?.innerHTML;
        return { 
            windowCount: windows.length, 
            xtermCount: xterms.length,
            allTestIds,
            rootHtml: rootHtml?.slice(0, 500)
        };
    });

    console.log(`[test] Found ${result.windowCount} windows and ${result.xtermCount} xterms.`);
    console.log(`[test] All data-testids found: ${result.allTestIds.join(', ')}`);
    console.log(`[test] Root HTML content: ${result.rootHtml}`);

    if (result.windowCount < 1) {
        console.error('[FAIL] No terminals found!');
        await browser.close();
        process.exit(1);
    }

    console.log('[test] Waiting for some terminal output...');
    await new Promise(r => setTimeout(r, 10000)); // Wait 10s for boot

    const hasOutput = await page.evaluate(() => {
        const rows = document.querySelectorAll('.xterm-rows');
        return Array.from(rows).some(r => r.textContent.trim().length > 0);
    });

    if (hasOutput) {
        console.log('[PASS] Terminals are rendering and have content.');
    } else {
        console.log('[WARN] Terminals found but no text detected yet. Might be still booting.');
    }

    await browser.close();
    console.log('[test] Done.');
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
