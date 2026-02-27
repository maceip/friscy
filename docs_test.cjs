const puppeteer = require('puppeteer');

async function testDocs() {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    page.on('console', msg => console.log(msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    await page.goto('http://localhost:9090', {waitUntil: 'networkidle0', timeout: 30000});
    await new Promise(r => setTimeout(r, 5000));
    await browser.close();
}

testDocs().catch(console.error);
