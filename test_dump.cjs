const puppeteer = require('puppeteer');

async function testDump() {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    page.on('response', response => {
        if (!response.ok()) {
            console.log(`HTTP ${response.status()} for ${response.url()}`);
        }
    });

    await page.goto('http://localhost:8081/?example=alpine', {waitUntil: 'networkidle0', timeout: 30000});
    await new Promise(r => setTimeout(r, 2000));
    
    await browser.close();
}

testDump().catch(console.error);
