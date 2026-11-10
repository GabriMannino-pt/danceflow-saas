import puppeteer from 'puppeteer';

const DOMAINS = [
  'https://danceflow-saas.web.app',
  'https://www.tropicalstyle.it'
];

const TARGET_ROUTES = [
  '/',
  '/login',
  '/parent',
  '/students',
  '/payments'
];

const DEEP_UNKNOWN_ROUTES = [
  '/unknown/deep/path/probe-1',
  '/parent/nonexistent/subroute/probe-2',
  '/students/99999/edit/fake/deep/route'
];

async function runLiveEndpointProbes() {
  console.log('================================================================');
  console.log('  CHALLENGER STRESS PROBES: LIVE PRODUCTION ENDPOINTS & ASSETS');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function report(passed, name, detail = '') {
    totalTests++;
    if (passed) {
      passedTests++;
      console.log(`  [PASS] ${name} ${detail ? '(' + detail + ')' : ''}`);
    } else {
      failedTests++;
      console.error(`  [FAIL] ${name} ${detail ? '— ' + detail : ''}`);
    }
  }

  // 1. HTTP Status 200 Probes on all specified routes
  console.log('--- 1. HTTP Route Probes (Status 200) ---');
  for (const domain of DOMAINS) {
    for (const route of TARGET_ROUTES) {
      const url = `${domain}${route}`;
      try {
        const res = await fetch(url, { redirect: 'follow' });
        const text = await res.text();
        const is200 = res.status === 200;
        const hasRoot = text.includes('id="root"');
        report(
          is200 && hasRoot,
          `GET ${url}`,
          `status: ${res.status}, finalURL: ${res.url}, hasRootDiv: ${hasRoot}`
        );
      } catch (err) {
        report(false, `GET ${url}`, err.message);
      }
    }
  }

  // 2. SPA Rewrites on unknown deep paths
  console.log('\n--- 2. SPA Rewrites on Unknown Deep Routes ---');
  for (const route of DEEP_UNKNOWN_ROUTES) {
    const url = `https://www.tropicalstyle.it${route}`;
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      const is200 = res.status === 200;
      const isHtml = res.headers.get('content-type')?.includes('text/html');
      const hasRoot = text.includes('id="root"');
      const hasScript = /<script\s+type="module"\s+crossorigin\s+src="\/assets\/index-/.test(text);

      report(
        is200 && isHtml && hasRoot && hasScript,
        `SPA Rewrite: ${route}`,
        `status: ${res.status}, content-type: ${res.headers.get('content-type')}, serves index.html: ${hasRoot && hasScript}`
      );
    } catch (err) {
      report(false, `SPA Rewrite: ${route}`, err.message);
    }
  }

  // 3. Asset Delivery & CDN Caching on Live Bundles
  console.log('\n--- 3. CDN Asset Delivery & Cache Headers ---');
  const indexRes = await fetch('https://www.tropicalstyle.it/', { redirect: 'follow' });
  const indexHtml = await indexRes.text();
  const cssMatch = indexHtml.match(/\/assets\/index-[a-zA-Z0-9_\-]+\.css/);
  const jsMatch = indexHtml.match(/\/assets\/index-[a-zA-Z0-9_\-]+\.js/);

  report(Boolean(cssMatch), 'Discovered production CSS bundle in live HTML', cssMatch ? cssMatch[0] : 'not found');
  report(Boolean(jsMatch), 'Discovered production JS bundle in live HTML', jsMatch ? jsMatch[0] : 'not found');

  if (cssMatch) {
    const cssUrl = `https://www.tropicalstyle.it${cssMatch[0]}`;
    const cssRes = await fetch(cssUrl);
    const cssText = await cssRes.text();
    const cacheControl = cssRes.headers.get('cache-control') || '';
    const contentType = cssRes.headers.get('content-type') || '';
    const isMinified = !cssText.includes('\n  ') && cssText.length > 50000;

    report(
      cssRes.status === 200,
      `CSS Bundle HTTP 200: ${cssUrl}`,
      `status: ${cssRes.status}, size: ${cssText.length} bytes`
    );
    report(
      contentType.includes('text/css'),
      'CSS Bundle Content-Type',
      `got: ${contentType}`
    );
    report(
      cacheControl.includes('max-age=31536000') && cacheControl.includes('immutable'),
      'CSS CDN Cache-Control header has 1-year immutable caching',
      `got: ${cacheControl}`
    );
    report(
      isMinified,
      'CSS Bundle is minified (no multiline indentation formatting, compact)',
      `size: ${cssText.length} bytes`
    );
  }

  if (jsMatch) {
    const jsUrl = `https://www.tropicalstyle.it${jsMatch[0]}`;
    const jsRes = await fetch(jsUrl);
    const jsText = await jsRes.text();
    const cacheControl = jsRes.headers.get('cache-control') || '';
    const contentType = jsRes.headers.get('content-type') || '';
    const lineCount = jsText.split('\n').length;
    const isMinified = lineCount < 100 && jsText.length > 20000;

    report(
      jsRes.status === 200,
      `JS Main Entry HTTP 200: ${jsUrl}`,
      `status: ${jsRes.status}, size: ${jsText.length} bytes`
    );
    report(
      contentType.includes('javascript'),
      'JS Main Entry Content-Type is javascript',
      `got: ${contentType}`
    );
    report(
      cacheControl.includes('max-age=31536000') && cacheControl.includes('immutable'),
      'JS CDN Cache-Control header has 1-year immutable caching',
      `got: ${cacheControl}`
    );
    report(
      isMinified,
      'JS Main Entry is minified with oxc (compressed lines)',
      `lines: ${lineCount}, size: ${jsText.length} bytes`
    );
  }

  // Probe vendor-libs chunk
  const vendorLibsRes = await fetch('https://www.tropicalstyle.it/assets/vendor-libs-C4gaOmE7.js');
  if (vendorLibsRes.status === 200) {
    const vText = await vendorLibsRes.text();
    const lineCount = vText.split('\n').length;
    report(
      vText.length > 500000 && vText.length < 800000 && lineCount < 100,
      'vendor-libs chunk size adheres to <= 800 kB budget and is minified',
      `size: ${Math.round(vText.length / 1024)} kB, lines: ${lineCount}`
    );
  } else {
    report(false, 'Fetch vendor-libs chunk', `status: ${vendorLibsRes.status}`);
  }

  // 4. Interactive Puppeteer Verification: First-Access Activation Flow
  console.log('\n--- 4. Interactive Puppeteer First-Access Flow ---');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=2048'],
  });

  try {
    const page = await browser.newPage();
    const failedNetworkRequests = [];
    const appConsoleErrors = [];

    page.on('requestfailed', (req) => {
      failedNetworkRequests.push({ url: req.url(), failure: req.failure()?.errorText });
    });

    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedNetworkRequests.push({ url: res.url(), status: res.status() });
      }
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore Google third-party frame-ancestors report-only advisory
        if (!text.includes('frame-ancestors')) {
          appConsoleErrors.push(text);
        }
      }
    });

    // Mobile Viewport probe
    await page.setViewport({ width: 390, height: 844 });
    const testUrl = 'https://danceflow-saas.web.app/login?email=genitore.collaudo%40tropicalstyle.it&firstAccess=true';
    console.log(`  Navigating mobile viewport to: ${testUrl}`);
    await page.goto(testUrl, { waitUntil: 'load', timeout: 35000 });

    const navigatedUrl = page.url();
    report(
      navigatedUrl.startsWith('https://www.tropicalstyle.it'),
      'Mobile navigation respects canonical redirection to www.tropicalstyle.it',
      `final url: ${navigatedUrl}`
    );

    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    const emailVal = await page.$eval('input[name="email"]', (el) => el.value);
    report(
      emailVal === 'genitore.collaudo@tropicalstyle.it',
      'Email input field is pre-populated correctly on mobile',
      `value: ${emailVal}`
    );

    const bannerText = await page.evaluate(() => {
      const banner = document.querySelector('.bg-emerald-50, .border-emerald-200, [class*="emerald"]');
      return banner ? banner.innerText : document.body.innerText;
    });

    report(
      bannerText.includes('Benvenuto nel Portale Genitori & Allievi!'),
      'First-access greeting banner renders prominently',
      'found greeting text'
    );

    report(
      bannerText.includes('Imposta Password di Accesso'),
      'First-access banner presents "🔑 Imposta Password di Accesso" CTA',
      'found CTA button'
    );

    // Switch to desktop viewport
    await page.setViewport({ width: 1280, height: 800 });
    await page.waitForFunction(() => document.readyState === 'complete');
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });

    // Click the "Imposta Password di Accesso" button
    const setPassBtnHandle = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Imposta Password di Accesso'));
    });

    if (setPassBtnHandle && setPassBtnHandle.asElement()) {
      await setPassBtnHandle.asElement().click();
      await page.waitForFunction(() => {
        const modal = document.querySelector('div[role="dialog"]') || document.querySelector('.fixed.inset-0');
        return modal !== null && modal.innerText.includes('Imposta la tua password');
      }, { timeout: 8000 });

      const modalInfo = await page.evaluate(() => {
        const modal = document.querySelector('div[role="dialog"]') || document.querySelector('.fixed.inset-0');
        if (!modal) return null;
        const title = modal.querySelector('h2, h3, [class*="font-bold"]')?.innerText || '';
        const desc = modal.querySelector('p')?.innerText || '';
        const emailInput = modal.querySelector('input[type="email"]');
        const buttons = Array.from(modal.querySelectorAll('button')).map((b) => b.innerText.trim());
        return {
          hasModal: true,
          title,
          desc,
          emailInputValue: emailInput ? emailInput.value : null,
          buttons,
        };
      });

      report(
        Boolean(modalInfo && modalInfo.hasModal),
        'Set Password Modal appears upon button click',
        `title: "${modalInfo?.title}"`
      );

      report(
        modalInfo && modalInfo.title.includes('Imposta la tua password'),
        'Modal title matches first-access context: "Benvenuto! Imposta la tua password"',
        `title: "${modalInfo?.title}"`
      );

      report(
        modalInfo && modalInfo.emailInputValue === 'genitore.collaudo@tropicalstyle.it',
        'Modal email input is pre-populated with parent email',
        `email: "${modalInfo?.emailInputValue}"`
      );

      report(
        modalInfo && modalInfo.buttons.some((b) => b.includes('Invia Link di Attivazione')),
        'Modal CTA button is "Invia Link di Attivazione"',
        `buttons: [${modalInfo?.buttons.join(', ')}]`
      );

      // Gracefully close modal via "Annulla"
      const closed = await page.evaluate(() => {
        const modal = document.querySelector('div[role="dialog"]') || document.querySelector('.fixed.inset-0');
        if (!modal) return false;
        const cancelBtn = Array.from(modal.querySelectorAll('button')).find(
          (b) => b.innerText.toLowerCase().includes('annulla')
        );
        if (cancelBtn) {
          cancelBtn.click();
          return true;
        }
        return false;
      });
      await new Promise((r) => setTimeout(r, 400));

      const modalDismissed = await page.evaluate(() => {
        const modal = document.querySelector('div[role="dialog"]');
        return !modal || modal.offsetParent === null;
      });

      report(
        closed && modalDismissed,
        'Modal cancels gracefully and restores login form without error',
        `modalDismissed: ${modalDismissed}`
      );
    } else {
      report(false, 'Find "Imposta Password di Accesso" button in DOM', 'button handle is null');
    }

    report(
      appConsoleErrors.length === 0,
      'No application-level console errors or uncaught exceptions during interactive probe',
      appConsoleErrors.length > 0 ? `Errors: ${appConsoleErrors.slice(0, 3).join('; ')}` : 'clean console'
    );

    if (failedNetworkRequests.length > 0) {
      console.log('  [INFO] Noted failed/4xx network requests during test:');
      for (const req of failedNetworkRequests) {
        console.log(`    - URL: ${req.url} (status: ${req.status || req.failure})`);
      }
    }

  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`ENDPOINT PROBE TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  console.log('================================================================\n');

  if (failedTests > 0) process.exit(1);
}

runLiveEndpointProbes();
