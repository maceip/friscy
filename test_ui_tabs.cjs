const puppeteer = require('puppeteer');

async function testTabs() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--js-flags=--max-old-space-size=4096'
        ]
    });

    const tabsToTest = [
        { name: 'Alpine', url: 'http://localhost:8081/?example=alpine' },
        { name: 'Node.js', url: 'http://localhost:8081/?example=nodejs' },
        { name: 'Go Server', url: 'http://localhost:8081/?example=server' }
    ];

    let overallPass = true;

    for (const tab of tabsToTest) {
        console.log(`\n=== Testing Tab: ${tab.name} ===`);
        const page = await browser.newPage();
        
        let errors = [];
        let doneBooting = false;

        page.on('console', async msg => {
            const text = msg.text();
            
            if (msg.type() === 'error' && !text.includes('Failed to load resource: the server responded with a status of 404')) {
                let detailedErrs = [];
                for (const arg of msg.args()) {
                    const val = await arg.jsonValue();
                    detailedErrs.push(typeof val === 'object' ? JSON.stringify(val) : String(val));
                }
                errors.push(`[${msg.type()}] ${detailedErrs.join(' ')}\n  raw: ${text}`);
            } else if (msg.type() === 'warning' && text.includes('SharedArrayBuffer is not defined')) {
                errors.push(`[Fatal WARNING] ${text}`);
            } else {
                console.log(`[${msg.type()}] ${text}`);
            }
            if (text.includes('booted in') || text.includes('listening on port') || text.includes('Welcome to Node.js')) {
                doneBooting = true;
            }
        });

        page.on('pageerror', err => {
            errors.push(`[PageError] ${err.stack || err.message}`);
        });

        console.log(`Navigating to ${tab.url}...`);
        
        try {
            await page.goto(tab.url, { waitUntil: 'load', timeout: 30000 });
            
            // Wait for service worker COOP/COEP reload
            await new Promise(r => setTimeout(r, 2000));
            try {
                await page.waitForNavigation({ waitUntil: 'load', timeout: 5000 }).catch(() => {});
            } catch(e) {}
            
            // Wait up to 25 seconds for the "Booting" phase to complete and terminal to render
            let elapsed = 0;
            while(elapsed < 250) {
                if (doneBooting) break;
                await new Promise(r => setTimeout(r, 100));
                elapsed++;
            }
            
            // Extract the terminal output text as another validation check
            await new Promise(r => setTimeout(r, 6000));
    const terminalText = await page.evaluate(() => {
                const el = document.querySelector('.xterm-rows');
                return el ? el.innerText : '';
            });

            if (terminalText.length > 0) {
                 console.log(`Terminal successfully rendered! Output snippet: \n${terminalText.split('\\n').slice(0, 5).join('\\n')}`);
            } else {
                 console.log(`Warning: Terminal element empty or not found.`);
                 errors.push('Terminal failed to render text output.');
            }

        } catch (err) {
            console.error(`Exception during test: ${err.message}`);
            errors.push(`[Exception] ${err.message}`);
        }

        if (errors.length > 0) {
            console.error(`\u274C Tab ${tab.name} failed with ${errors.length} errors:`);
            errors.forEach(e => console.error(e));
            overallPass = false;
        } else {
            console.log(`\u2705 Tab ${tab.name} passed cleanly with no console errors.`);
        }

        await page.close();
    }

    await browser.close();
    
    if (overallPass) {
        console.log("\n\u2728 All tabs rendered successfully with zero JavaScript errors.");
        process.exit(0);
    } else {
        console.error("\n\u274C Tests failed due to console errors.");
        process.exit(1);
    }
}

testTabs().catch(console.error);
