import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url, paneId, input, mustContain = []) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction((id) => Boolean(window.__stareTermDebug?.[id]), { timeout: 120000 }, paneId);

    // wait a bit for boot progress
    await sleep(25000);

    const pre = await page.evaluate((id) => {
      const d = window.__stareTermDebug?.[id];
      return {
        status: d?.getStatus?.() ?? 'missing',
        tail: (d?.getTranscript?.() ?? '').slice(-1200),
      };
    }, paneId);

    await page.evaluate((id, cmd) => {
      window.__stareTermDebug?.[id]?.sendInput?.(cmd);
    }, paneId, input);

    await sleep(15000);

    const post = await page.evaluate((id) => {
      const d = window.__stareTermDebug?.[id];
      return {
        status: d?.getStatus?.() ?? 'missing',
        tail: (d?.getTranscript?.() ?? '').slice(-2500),
      };
    }, paneId);

    const commandEchoed = post.tail.includes(input.trim());
    const containsAll = mustContain.every((p) => post.tail.includes(p));

    return { ok: true, paneId, pre, post, commandEchoed, containsAll };
  } catch (e) {
    return { ok: false, paneId, error: String(e) };
  } finally {
    await browser.close();
  }
}

const base = 'http://127.0.0.1:9925/?automation=1&autoboot=1';

const claude = await probe(`${base}&preset=claude-solo`, 'claude-1', 'claude mcp list\n', ['claude']);
const gemini = await probe(`${base}&preset=heating-up`, 'gemini-2', 'gemini --version\n', ['gemini']);
const codex = await probe(`${base}&preset=tits`, 'codex-3', 'codex --help\n', ['codex']);

console.log(JSON.stringify({ claude, gemini, codex }, null, 2));
