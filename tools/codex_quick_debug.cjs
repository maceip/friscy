const puppeteer = require('puppeteer');
const fs = require('fs');

const BASE='http://127.0.0.1:9096';

function readKey(){
  if(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) return process.env.OPENAI_API_KEY.trim();
  try {
    const raw = fs.readFileSync('.env','utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m=line.match(/^OPENAI_API_KEY\s*=\s*(.*)$/);
      if(!m) continue;
      let v=m[1].trim();
      if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
      if(v) return v;
    }
  } catch {}
  return 'dummy-key';
}

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function waitForPhase(page, allowed, timeoutMs, label){
  const t0=Date.now();
  let last=0;
  while(Date.now()-t0<timeoutMs){
    const phase=await page.evaluate(()=>window._friscy?.phase||'none');
    if(allowed.includes(phase)) return phase;
    if(Date.now()-last>2000){
      last=Date.now();
      console.log(`[dbg] ${label} phase=${phase} elapsed=${Date.now()-t0}ms`);
    }
    await sleep(250);
  }
  const p=await page.evaluate(()=>window._friscy?.phase||'none');
  throw new Error(`${label} timeout last=${p}`);
}

async function sendAndWait(page, cmd, timeout){
  console.log('[dbg] send',cmd);
  const before=await page.evaluate(()=>document.querySelector('.xterm-rows')?.textContent||'');
  await page.evaluate(c=>window.term?.paste(c+'\r'),cmd);
  await waitForPhase(page,['working','streaming','slash','login_wait'],10000,'leave prompt');
  await waitForPhase(page,['prompt'],timeout,'return prompt');
  const after=await page.evaluate(()=>document.querySelector('.xterm-rows')?.textContent||'');
  return after.slice(Math.max(0,before.length-250));
}

(async()=>{
  const key=readKey();
  console.log('[dbg] key source', key==='dummy-key' ? 'dummy' : 'real');

  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();
  page.on('console',m=> {
    const t = m.text();
    if (m.type() === 'error' || m.type() === 'warning' || t.includes('Exit code:') || t.includes('Error:') || t.includes('READY') || t.includes('SHELL')) {
      console.log(`[browser:${m.type()}] ${t}`);
    }
  });
  page.on('pageerror',e=>console.log('[pageerror]',e.message));

  console.log('[dbg] goto fresh codex');
  await page.goto(`${BASE}/claude-demo.html?example=codex&nosw=1&noautockpt=1&cb=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:120000});
  let phase=await waitForPhase(page,['apikey','prompt'],120000,'boot ready');
  console.log('[dbg] boot phase',phase);
  if(phase==='apikey') await page.evaluate(k=>window.term?.paste(k+'\r'),key);
  await waitForPhase(page,['prompt'],120000,'prompt after key');

  const out1=await sendAndWait(page,"bash -lc 'codex --version'",60000);
  const out2=await sendAndWait(page,"bash -lc \"codex e 'Reply with exactly: MARK_CODEX_OK'\"",120000);
  console.log('CMD1_OK=' + /codex fast-path/i.test(out1));
  console.log('CMD1_TAIL=' + JSON.stringify(out1.slice(-400)));
  console.log('CMD2_MARKER_OK=' + /MARK_CODEX_OK/.test(out2));
  console.log('CMD2_TAIL=' + JSON.stringify(out2.slice(-400)));

  console.log('[dbg] goto resume codex-version-post.ckpt');
  await page.goto(`${BASE}/claude-demo.html?example=codex&nosw=1&ckpt=./codex-version-post.ckpt&cb=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:120000});
  phase=await waitForPhase(page,['apikey','prompt'],120000,'resume ready');
  console.log('[dbg] resume phase',phase);
  if(phase==='apikey') await page.evaluate(k=>window.term?.paste(k+'\r'),key);
  await waitForPhase(page,['prompt'],120000,'prompt after resume key');
  const out3=await sendAndWait(page,"bash -lc 'codex --version'",60000);
  console.log('RESUME_CMD_OK=' + /codex fast-path/i.test(out3));
  console.log('RESUME_CMD_TAIL=' + JSON.stringify(out3.slice(-400)));

  await browser.close();
})();
