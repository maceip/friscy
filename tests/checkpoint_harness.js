#!/usr/bin/env node
const readline = require('readline');
const dns = require('dns').promises;
const fs = require('fs').promises;
const crypto = require('crypto');

async function doWork() {
  const d = await dns.lookup('httpbin.org');
  const r = await fetch('http://httpbin.org/get');
  const t = await r.text();
  const h = crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
  await fs.writeFile('/tmp/checkpoint-post-restore.txt', `${d.address} ${h}\n`);
  return { ip: d.address, hash: h };
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('HARNESS_READY');

rl.question('CMD1> ', async (cmd1) => {
  const action = cmd1.trim();
  if (action === 'do') {
    try {
      const out = await doWork();
      console.log('HARNESS_DONE', out.ip, out.hash);
    } catch (e) {
      console.log('HARNESS_ERR', e && (e.stack || e.message || String(e)));
    }
  } else {
    console.log('HARNESS_SKIP', action);
  }

  rl.question('CMD2> ', (cmd2) => {
    console.log('HARNESS_CMD2', cmd2.trim());
    rl.close();
    process.exit(0);
  });
});
