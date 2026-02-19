import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  console.log('[test] Navigating to http://localhost:5180 ...');
  page.on('console', msg => console.log('[browser]', msg.text()));
  await page.goto('http://localhost:5180');
  
  // Wait for IntroOverlay to appear
  await page.waitForSelector('[data-testid="intro-overlay"]', { timeout: 10000 });
  console.log('[test] Intro overlay found.');

  // Find the Boot button (Power icon) in the Alpine window
  // IntroOverlay renders different things for 'welcome' vs 'stats'
  // DesktopLayout: {id === 'claude' ? 'welcome' : 'stats'}
  // The boot button is in the 'stats' one (Alpine)
  console.log('[test] Clicking Boot button...');
  const bootButton = await page.$('div[data-testid="window-alpine"] button[title="Boot System"]');
  if (bootButton) {
      await bootButton.click();
      console.log('[test] Boot button clicked.');
  } else {
      console.error('[FAIL] Could not find boot button');
      await browser.close();
      process.exit(1);
  }

  // Wait for boot to start (logs show it's running)
  console.log('[test] Waiting for system to reach running state...');
  await new Promise(r => setTimeout(r, 10000)); // Give it 10s to boot
  
  await page.screenshot({ path: 'tests/debug_booted.png' });
  console.log('[test] Booted screenshot saved.');

  // Find Pause button in Alpine window
  console.log('[test] Finding Pause button in Alpine window...');
  const buttons = await page.$$('div[data-testid="window-alpine"] [data-testid="pause-button"]');
  console.log(`[test] Found ${buttons.length} pause buttons in Alpine window`);
  
  if (buttons.length > 0) {
      console.log('[test] Clicking FIRST Pause in Alpine...');
      await buttons[0].click();
      
      // Wait for UI to update (any button title change)
      console.log('[test] Waiting for any Resume button to appear in Alpine...');
      try {
          await page.waitForFunction(() => {
              const btns = Array.from(document.querySelectorAll('div[data-testid="window-alpine"] [data-testid="pause-button"]'));
              return btns.some(b => b.title === 'Resume Session');
          }, { timeout: 15000 });
      } catch (e) {
          console.error('[FAIL] Timed out waiting for Resume Session title in Alpine.');
          const debugInfo = await page.evaluate(() => {
              const windows = Array.from(document.querySelectorAll('div[data-testid="window-alpine"]'));
              return windows.map((w, i) => {
                  const btns = Array.from(w.querySelectorAll('[data-testid="pause-button"]'));
                  return {
                      windowIndex: i,
                      visible: w.offsetParent !== null,
                      buttons: btns.map(b => ({ title: b.title, text: b.textContent }))
                  };
              });
          });
          console.log('[DEBUG] Window/Button state:', JSON.stringify(debugInfo, null, 2));
          await page.screenshot({ path: 'tests/debug_fail_alpine_pause.png' });
          throw e;
      }

      console.log('[test] Resume button detected in Alpine.');
      await page.screenshot({ path: 'tests/debug_paused_alpine.png' });

      // Check for "Snapshot Active" text in DOM
      const overlayText = await page.evaluate(() => {
          return document.body.textContent.includes('Snapshot Active');
      });
      
      if (overlayText) {
          console.log('[PASS] Snapshot overlay found.');
      } else {
          console.error('[FAIL] Snapshot overlay text not found!');
      }

      // Resume
      console.log('[test] Clicking Resume in Alpine...');
      const currentButtons = await page.$$('div[data-testid="window-alpine"] [data-testid="pause-button"]');
      if (currentButtons.length > 0) {
          await currentButtons[0].click();
          console.log('[test] Resume button clicked in Alpine.');
      }
      
      await new Promise(r => setTimeout(r, 2000));
      
      // Verify overlay is gone
      const overlayGone = await page.evaluate(() => {
          return !document.body.textContent.includes('Snapshot Active');
      });
      if (overlayGone) {
          console.log('[PASS] Snapshot overlay removed in Alpine.');
      } else {
          console.error('[FAIL] Snapshot overlay still present in Alpine!');
      }
  } else {
      console.error('[FAIL] Could not find pause button in Alpine window');
  }

  await browser.close();
})();
