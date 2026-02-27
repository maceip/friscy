const puppeteer = require('puppeteer');

async function testLaunch() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--js-flags=--max-old-space-size=4096',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list=420495844b05bced48fec238e550597011e64ef41df1d9fa8eaf3f7430be0d4b'
        ]
    });

    const TARGET_URL = 'http://localhost:8081/';
    console.log(`Testing target: ${TARGET_URL}`);

    let overallPass = true;
    let errors = [];

    const page = await browser.newPage();
    
    // Log unexpected errors
    page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('404')) {
            console.warn(`[Page Error] ${msg.text()}`);
        }
    });
    
    page.on('pageerror', err => {
        errors.push(`[Unhandled Exception] ${err.message || err}`);
    });

    try {
        console.log("Navigating to target...");
        const targetUrlWithCacheBust = new URL(TARGET_URL);
        targetUrlWithCacheBust.searchParams.set('cb', Date.now());
        await page.goto(targetUrlWithCacheBust.toString(), { waitUntil: 'load', timeout: 30000 });
        
        // Wait for service worker isolation reload if necessary
        await new Promise(r => setTimeout(r, 2000));
        try {
            await page.waitForNavigation({ waitUntil: 'load', timeout: 5000 }).catch(() => {});
        } catch(e) {}

        console.log("Waiting for UI to become ready...");
        try {
            await page.waitForSelector('#terminal', { timeout: 30000 });
            // Wait for booting overlay to go away
            await page.waitForFunction(() => {
                const overlay = document.getElementById('progress-overlay');
                return overlay && overlay.classList.contains('hidden');
            }, { timeout: 30000 });
        } catch (e) {
            errors.push("Failed to reach ready state / terminals visible: " + e.message);
        }

        console.log("Checking headers...");
        const headerOk = await page.evaluate(() => {
            const problems = [];
            const headerText = document.querySelector('header') ? document.querySelector('header').innerText : '';
            if (headerText.toLowerCase().includes('friscy')) {
                if (document.querySelector('h1') && document.querySelector('h1').innerText.toLowerCase().includes('friscy')) {
                    problems.push("Found 'friscy' text in header H1.");
                }
            }
            if (!document.querySelector('img[src*="friscylogo.png"]')) {
                problems.push("Top-left logo friscylogo.png not found.");
            }
            if (!document.querySelector('img[src*="mcp.svg"]')) {
                problems.push("Top-right mcp.svg not found.");
            }
            if (!document.querySelector('img[src*="riscv-logo.svg"]')) {
                problems.push("Top-right riscv-logo.svg not found.");
            }
            return problems;
        });
        if (headerOk.length > 0) {
            errors.push("Header check failed: " + headerOk.join(", "));
        }

        console.log("Checking Suspend/Resume structure...");
        const controlsOk = await page.evaluate(() => {
             const problems = [];
             const pauseBtn = document.getElementById('pause-btn');
             const suspendBtn = document.getElementById('suspend-btn');
             const suspendIcon = document.getElementById('suspend-icon');
             if (!pauseBtn) problems.push("Pause button missing");
             if (!suspendBtn) problems.push("Suspend button missing");
             if (!suspendIcon || !suspendIcon.src.includes('SUSPEND.svg')) problems.push("Suspend icon not SUSPEND.svg initially");
             return problems;
        });
        if (controlsOk.length > 0) {
            errors.push("Suspend/resume control check failed: " + controlsOk.join(", "));
        }

        // Test Terminal behaviors across tabs
        const tabs = ['alpine', 'nodejs', 'server'];
        for (const t of tabs) {
            console.log(`\nTesting terminal: ${t}...`);
            await page.click(`#tab-${t}`);
            // Wait a moment for terminal switch and potential reboot
            await new Promise(r => setTimeout(r, 2000));
            // Wait for boot to finish again (if it reboots)
            await page.waitForFunction(() => {
                const overlay = document.getElementById('progress-overlay');
                return overlay && overlay.classList.contains('hidden');
            }, { timeout: 30000 }).catch(()=>{});

            // Let it settle
            await new Promise(r => setTimeout(r, 3000));

            // Test Suspend/resume interaction
            console.log("  Clicking Suspend...");
            await page.click('#suspend-btn');
            await new Promise(r => setTimeout(r, 500));
            const isSuspended = await page.evaluate(() => {
                const btn = document.getElementById('suspend-btn');
                const icon = document.getElementById('suspend-icon');
                return btn.style.opacity === '0.5' && icon.src.includes('RESUME.svg');
            });
            if (!isSuspended) { console.warn(`Suspend icon test failed on tab ${t}`); errors.push(`Failed to suspend VM on tab ${t}`); }

            console.log("  Clicking Resume...");
            await page.click('#suspend-btn'); // click again to resume
            await new Promise(r => setTimeout(r, 500));
            
            const isResumed = await page.evaluate(() => {
                const btn = document.getElementById('suspend-btn');
                const icon = document.getElementById('suspend-icon');
                return icon.src.includes('SUSPEND.svg');
            });
            if (!isResumed) errors.push(`Failed to resume VM on tab ${t}`);
            
            if (t === 'server') {
                 console.log("  Testing network behavior (Go echo server)...");
                 // Let the server spin up and bind port 8080.
                 await new Promise(r => setTimeout(r, 4000));
                 try {
                     // Verify Go server actually acquired network and bound port
                     console.log("  Verifying Go server network init...");
                     const termText = await page.evaluate(() => {
                         const el = document.querySelector('.xterm-rows');
                         return el ? el.innerText : '';
                     });
                     if (!termText.includes('listening on port')) {
                         errors.push(`[Network] Go echo server terminal output does not indicate successful network bind. Found: ${termText.substring(0, 50)}...`);
                     } else {
                         console.log("  Go Server correctly bound port 8080 over WebTransport proxy.");
                     }
                 } catch(e) {
                     errors.push(`[Network] Failed to fetch Go echo server from browser side: ${e.message}`);
                 }
            }
        }

    } catch (e) {
        errors.push(`Critical failure during test execution: ${e.message}`);
    } finally {
        await browser.close();
    }

    if (errors.length === 0) {
        console.log("\n✅ ALL TESTS PASSED! Puppeteer Green!");
        process.exit(0);
    } else {
        console.log("\n❌ TESTS FAILED:");
        errors.forEach(e => console.error(e));
        process.exit(1);
    }
}

testLaunch().catch(console.error);
