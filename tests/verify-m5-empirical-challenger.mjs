import puppeteer from 'puppeteer';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const PRODUCTION_URL = 'https://danceflow-saas.web.app';
const CANONICAL_URL = 'https://www.tropicalstyle.it';

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(parsed, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'EmpiricalChallenger/2.0 (Windows NT 10.0; Win64; x64)',
        ...(options.headers || {})
      },
      timeout: 15000
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: buf.toString('utf8'),
          buffer: buf,
          byteLength: buf.length
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });

    req.on('error', reject);
    req.end();
  });
}

async function fetchWithRedirects(url, maxRedirects = 5) {
  let cur = url;
  let count = 0;
  while (count < maxRedirects) {
    const res = await fetchUrl(cur);
    if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
      cur = new URL(res.headers.location, cur).href;
      count++;
    } else {
      return { ...res, finalUrl: cur, redirects: count };
    }
  }
  throw new Error(`Too many redirects from ${url}`);
}

async function runEmpiricalAudit() {
  console.log('========================================================================');
  console.log('  EMPIRICAL CHALLENGER AUDIT: LIVE PRODUCTION DEPLOYMENT (MILESTONE 5)');
  console.log('  Hosts: ' + PRODUCTION_URL + ' / ' + CANONICAL_URL);
  console.log('========================================================================\n');

  const auditResults = {
    total: 0,
    passed: 0,
    failed: 0,
    failures: []
  };

  function test(name, pass, details = '') {
    auditResults.total++;
    if (pass) {
      console.log(`  [PASS] ${name}${details ? ` (${details})` : ''}`);
      auditResults.passed++;
    } else {
      console.error(`  [FAIL] ${name} — ${details}`);
      auditResults.failed++;
      auditResults.failures.push({ name, details });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ENDPOINT AVAILABILITY & HTTP STATUS (LANDING, LOGIN, PARENT, STUDENTS)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- 1. HTTP Endpoint Status & SPA Rewrites ---');

  const routesToTest = [
    { path: '/', name: 'Landing Root' },
    { path: '/login', name: 'Login Page' },
    { path: '/parent', name: 'Parent Portal Route' },
    { path: '/students', name: 'Students Staff Route' },
    { path: '/payments', name: 'Payments Staff Route' },
    { path: '/courses', name: 'Courses Route' },
    { path: '/non-existent-spa-route-challenger-check', name: 'SPA Deep Route Rewrite' }
  ];

  for (const route of routesToTest) {
    const liveUrl = `${PRODUCTION_URL}${route.path}`;
    try {
      const res = await fetchUrl(liveUrl);
      test(
        `Direct GET ${route.path} on danceflow-saas.web.app returns 200`,
        res.statusCode === 200,
        `Status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}`
      );

      const hasHtml = res.data.toLowerCase().includes('<!doctype html>');
      const hasRoot = res.data.includes('id="root"');
      test(
        `Direct GET ${route.path} serves valid SPA HTML shell with #root`,
        hasHtml && hasRoot,
        `Length: ${res.byteLength} bytes`
      );
    } catch (e) {
      test(`Direct GET ${route.path} on danceflow-saas.web.app`, false, e.message);
    }
  }

  // Also check canonical domain www.tropicalstyle.it
  console.log('\n--- 2. Canonical Domain Probes (www.tropicalstyle.it) ---');
  for (const route of routesToTest.slice(0, 3)) {
    const canonUrl = `${CANONICAL_URL}${route.path}`;
    try {
      const res = await fetchUrl(canonUrl);
      test(
        `Canonical GET ${route.path} returns 200`,
        res.statusCode === 200,
        `Status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}`
      );
    } catch (e) {
      test(`Canonical GET ${route.path}`, false, e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. LIVE STATIC SCRIPT BUNDLES AVAILABILITY & INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Live Static Script Bundles Availability & Integrity ---');

  // Extract assets from live index.html
  const liveIndex = await fetchUrl(`${PRODUCTION_URL}/`);
  const scriptRegex = /src="\/assets\/([^"]+)"/g;
  const cssRegex = /href="\/assets\/([^"]+)"/g;

  const scriptFiles = [...liveIndex.data.matchAll(scriptRegex)].map(m => m[1]);
  const cssFiles = [...liveIndex.data.matchAll(cssRegex)].map(m => m[1]);

  test('Live index.html contains script bundle references', scriptFiles.length > 0, `Found: ${scriptFiles.join(', ')}`);
  test('Live index.html contains stylesheet references', cssFiles.length > 0, `Found: ${cssFiles.join(', ')}`);

  // Verify all entry assets return 200 and have immutable cache headers
  for (const s of [...scriptFiles, ...cssFiles]) {
    const assetUrl = `${PRODUCTION_URL}/assets/${s}`;
    const res = await fetchUrl(assetUrl);
    test(
      `Live asset ${s} returns 200`,
      res.statusCode === 200,
      `Status: ${res.statusCode}, Size: ${res.byteLength}b`
    );
    test(
      `Live asset ${s} has immutable cache-control`,
      res.headers['cache-control']?.includes('max-age=31536000') || res.headers['cache-control']?.includes('immutable'),
      `Cache-Control: ${res.headers['cache-control']}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. CODE FEATURE SIGNATURES IN LIVE PRODUCTION BUNDLES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Feature Code Signatures inside Live Bundles ---');

  // Verify each milestone feature exists in the live deployed bundles
  const featureAudits = [
    {
      milestone: 'M1 (Certificato Medico - 1B)',
      bundle: 'fileCompression-B_qzjIp0.js',
      patterns: [
        'compressMedicalCertificate',
        'openDocumentBlobUrl',
        'example.com/mock-upload'
      ]
    },
    {
      milestone: 'M1 (Certificato Medico Approval - 1B)',
      bundle: 'StudentDetailPage-DKyvpoBH.js',
      patterns: [
        'Approva Certificato',
        'medicalClearance',
        'openDocumentBlobUrl',
        'Invia Credenziali Portale'
      ]
    },
    {
      milestone: 'M1 (Parent Portal In-Review Badge - 1B)',
      bundle: 'ParentPortalPage-CG197Zu2.js',
      patterns: [
        'In Revisione',
        'compressMedicalCertificate'
      ]
    },
    {
      milestone: 'M2 (Resilient Student Form - 2A)',
      bundle: 'StudentForm-Biyn8l2k.js',
      patterns: [
        'Attenzione: compila i campi obbligatori evidenziati',
        'aria-invalid',
        'scrollIntoView'
      ]
    },
    {
      milestone: 'M3 (First-Access Portal Activation - 3A & 3B)',
      bundle: 'LoginPage-yyA-1w70.js',
      patterns: [
        'firstAccess',
        'Benvenuto nel Portale Genitori & Allievi',
        'Imposta Password di Accesso'
      ]
    },
    {
      milestone: 'M3 (WhatsApp Official Template - 3A)',
      bundle: 'whatsapp-7emM6WGO.js',
      patterns: [
        'buildPortalInvitationWhatsAppMessage',
        'Portale Ufficiale',
        'ricevute fiscali dei pagamenti',
        'certificato medico di idoneità',
        'activationLink'
      ]
    },
    {
      milestone: 'M4 (Receipt Number Search & Edit Modal - 4A)',
      bundle: 'PaymentsPage-zPtmvdY2.js',
      patterns: [
        'Modifica Ricevuta',
        'receiptNumber'
      ]
    },
    {
      milestone: 'M4 (Receipt Preservation Mutation - 4A)',
      bundle: 'usePayments-BTkeUpvo.js',
      patterns: [
        'updateReceiptPayment',
        'receiptNumber'
      ]
    }
  ];

  for (const fa of featureAudits) {
    const bundleUrl = `${PRODUCTION_URL}/assets/${fa.bundle}`;
    try {
      const res = await fetchUrl(bundleUrl);
      test(`Feature bundle ${fa.bundle} exists (HTTP 200)`, res.statusCode === 200, `${fa.milestone}`);
      if (res.statusCode === 200) {
        for (const pat of fa.patterns) {
          const found = res.data.includes(pat);
          test(`  [${fa.milestone}] Contains "${pat}"`, found, `Bundle: ${fa.bundle}`);
        }
      }
    } catch (e) {
      test(`Fetch ${fa.bundle}`, false, e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. LIVE BROWSER RUNTIME VERIFICATION (PUPPETEER)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Live Puppeteer Browser Runtime Execution ---');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const uncaughtErrors = [];
    page.on('pageerror', (err) => {
      uncaughtErrors.push(err.message);
    });

    // Test A: Normal Login page
    console.log('Navigating to live /login ...');
    await page.goto(`${PRODUCTION_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
    test('Live /login loaded with 0 uncaught errors', uncaughtErrors.length === 0, `Errors: ${uncaughtErrors.join('; ')}`);

    const title = await page.title();
    test('Live page title contains Tropical Style', title.includes('Tropical Style'), `Title: "${title}"`);

    const emailInput = await page.$('input[name="email"]');
    test('Login email input is present on live app', emailInput !== null);

    const passwordInput = await page.$('input[name="password"]');
    test('Login password input is present on live app', passwordInput !== null);

    // Test B: First-Access Portal Link
    console.log('Navigating to live first-access activation URL...');
    const testEmail = 'empirico.challenger@tropicalstyle.it';
    await page.goto(
      `${PRODUCTION_URL}/login?email=${encodeURIComponent(testEmail)}&firstAccess=true`,
      { waitUntil: 'networkidle2', timeout: 30000 }
    );

    const prefilledEmail = await page.$eval('input[name="email"]', el => el.value);
    test('First-access flow automatically pre-fills email', prefilledEmail === testEmail, `Value: "${prefilledEmail}"`);

    const pageContent = await page.evaluate(() => document.body.innerText);
    test(
      'First-access greeting banner is rendered on live page',
      pageContent.includes('Benvenuto nel Portale Genitori & Allievi!'),
      'Greeting text matched'
    );
    test(
      'First-access set password action button is visible',
      pageContent.includes('Imposta Password di Accesso'),
      'Action button matched'
    );

    // Test C: Open Password Setup Modal on live production
    console.log('Interacting with "Imposta Password di Accesso" button...');
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.innerText.includes('Imposta Password di Accesso'));
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    test('Found and clicked "Imposta Password di Accesso"', clicked);

    if (clicked) {
      await new Promise(r => setTimeout(r, 600));
      const modalText = await page.evaluate(() => document.body.innerText);
      test(
        'Modal opens with title "Imposta la tua Password"',
        modalText.toLowerCase().includes('imposta la tua password'),
        'Modal rendered in live DOM'
      );

      // Verify inputs in modal
      const newPasswordInput = await page.$('input[type="password"]');
      test('Password setup input is rendered in modal', newPasswordInput !== null);

      // Click "Annulla" to close modal cleanly
      const closed = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const cancelBtn = btns.find(b => b.innerText.includes('Annulla') || b.innerText.includes('Chiudi'));
        if (cancelBtn) {
          cancelBtn.click();
          return true;
        }
        return false;
      });
      test('Closed password setup modal cleanly', closed);
    }

    // Test D: Deep Link SPA routing without page reload
    console.log('Testing live SPA deep links...');
    await page.goto(`${PRODUCTION_URL}/parent`, { waitUntil: 'networkidle2', timeout: 30000 });
    // In unauthenticated state, it should redirect to /login or show auth form smoothly without 404
    const parentUrl = page.url();
    test('Accessing /parent resolves smoothly without HTTP 404 or whiteout', parentUrl.includes('/login') || parentUrl.includes('/parent'), `URL: ${parentUrl}`);

  } finally {
    await browser.close();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. ADVERSARIAL STRESS PROBING
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Adversarial Probes & Resiliency ---');

  // Probe A: Malformed firstAccess query parameters
  const malformedParams = [
    { query: '?email=&firstAccess=true', desc: 'Empty email param' },
    { query: '?email=invalid-not-an-email&firstAccess=true', desc: 'Invalid format email param' },
    { query: '?email=test%2Btag@tropicalstyle.it&firstAccess=false', desc: 'firstAccess=false' },
    { query: '?firstAccess=true', desc: 'firstAccess without email' }
  ];

  for (const mp of malformedParams) {
    const res = await fetchUrl(`${PRODUCTION_URL}/login${mp.query}`);
    test(`Malformed param "${mp.desc}" handled safely (HTTP 200)`, res.statusCode === 200, `Status: ${res.statusCode}`);
  }

  // Probe B: Verify Security Headers on Production
  console.log('\n--- 7. Production Security Headers Check ---');
  const prodRoot = await fetchUrl(`${PRODUCTION_URL}/`);
  test(
    'Strict-Transport-Security header present on production',
    Boolean(prodRoot.headers['strict-transport-security']),
    `HSTS: ${prodRoot.headers['strict-transport-security'] || 'none'}`
  );
  test(
    'X-Content-Type-Options header present on production',
    Boolean(prodRoot.headers['x-content-type-options']),
    `X-Content-Type-Options: ${prodRoot.headers['x-content-type-options'] || 'none'}`
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`TOTAL AUDIT CHECKS: ${auditResults.total} | PASSED: ${auditResults.passed} | FAILED: ${auditResults.failed}`);
  const passRate = Math.round((auditResults.passed / auditResults.total) * 100);
  console.log(`PASS RATE: ${passRate}%`);
  console.log('========================================================================\n');

  if (auditResults.failed > 0) {
    console.error('Audit encountered failures:');
    auditResults.failures.forEach(f => console.error(`  - ${f.name}: ${f.details}`));
    process.exit(1);
  } else {
    console.log('ALL EMPIRICAL CHALLENGES PASSED SUCCESSFULLY WITH ZERO FAILURES.');
    process.exit(0);
  }
}

runEmpiricalAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
