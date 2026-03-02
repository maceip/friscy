const puppeteer = require('puppeteer');

const PORT = Number(process.argv[2] || 9096);
const CKPT = process.argv[3] || 'codex-version-post.ckpt';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60 * 60 * 1000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-service-worker',
      '--enable-features=SharedArrayBuffer',
      '--enable-features=WebAssemblyExnRef',
    ],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);

  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (
      msg.type() === 'error'
      || text.includes('checkpoint')
      || text.includes('Error')
      || text.includes('EBREAK')
      || text.includes('exit')
      || text.includes('worker')
      || text.includes('resume')
    ) {
      console.log(`[browser:${msg.type()}] ${text}`);
    }
  });
  page.on('pageerror', (e) => {
    const line = `[pageerror] ${e.message}`;
    logs.push(line);
    console.log(line);
  });

  async function phase() {
    return await page.evaluate(() => window._friscy?.phase || 'none');
  }

  async function ensurePrompt(timeoutMs = 180000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const p = await phase();
      if (p === 'apikey') {
        await page.evaluate(() => {
          const key = window.localStorage.getItem('apikey') || 'offline-dummy-key';
          window.term?.paste(key + '\r');
        });
      }
      if (p === 'prompt') return;
      await sleep(200);
    }
    throw new Error(`ensurePrompt timeout lastPhase=${await phase()}`);
  }

  async function boot(ckpt = null) {
    const q = ckpt
      ? `?example=codex&nosw=1&noautockpt=1&ckpt=${encodeURIComponent('./' + ckpt)}&cb=${Date.now()}`
      : `?example=codex&nosw=1&noautockpt=1&cb=${Date.now()}`;
    await page.goto(`http://127.0.0.1:${PORT}/claude-demo.html${q}`, { waitUntil: 'networkidle2', timeout: 180000 });
    await ensurePrompt();
    await page.evaluate(() => {
      if (!window.__cap && window.term) {
        window.__cap = '';
        const orig = window.term.write.bind(window.term);
        window.term.write = (x) => {
          window.__cap += String(x || '');
          return orig(x);
        };
      }
      window.__mark = (window.__cap || '').length;
    });
  }

  async function runCmd(cmd, timeoutMs = 180000) {
    await page.evaluate(() => { window.__mark = (window.__cap || '').length; });
    await page.evaluate((c) => window.term?.paste(c + '\r'), cmd);
    const t0 = Date.now();
    let lastLog = 0;
    while (Date.now() - t0 < timeoutMs) {
      const p = await phase();
      if (Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        console.log(`[probe] cmd phase=${p} elapsed=${Date.now() - t0}ms`);
      }
      if (p === 'prompt' && Date.now() - t0 > 700) break;
      await sleep(200);
    }
    const out = await page.evaluate(() => {
      const b = window.__cap || '';
      const m = window.__mark || 0;
      return b.slice(m);
    });
    return out;
  }

  try {
    console.log('[probe] boot fresh');
    await boot(null);
    const out1 = await runCmd("bash -lc 'codex --version'", 60000);
    console.log('[probe] fresh ok=', /codex fast-path/.test(out1));

    console.log('[probe] boot resume', CKPT);
    await boot(CKPT);
    console.log('[probe] resume prompt reached');

    const out2 = await runCmd("bash -lc 'codex --version'", 120000);
    const ok2 = /codex fast-path/.test(out2);
    console.log('[probe] resume ok=', ok2);
    if (!ok2) {
      console.log('[probe] resume tail=', JSON.stringify((out2 || '').slice(-500)));
    }
  } catch (e) {
    console.log('[probe] error', e.message);
  }

  console.log('[probe] logTail');
  for (const line of logs.slice(-80)) console.log(line);

  await browser.close();
})();
