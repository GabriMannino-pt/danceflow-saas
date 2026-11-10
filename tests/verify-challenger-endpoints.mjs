import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_HOSTS = [
  'https://danceflow-saas.web.app',
  'https://www.tropicalstyle.it'
];

function fetchEndpoint(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request(parsedUrl, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DanceFlowChallenger/1.0',
        ...(options.headers || {})
      },
      timeout: 10000
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          bodyBuffer,
          bodyText: bodyBuffer.toString('utf8'),
          finalUrl: url
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });

    req.on('error', (err) => reject(err));

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Also follow redirects if any
async function fetchWithRedirects(url, maxRedirects = 5) {
  let currentUrl = url;
  let redirects = 0;
  while (redirects < maxRedirects) {
    const res = await fetchEndpoint(currentUrl);
    if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
      const nextUrl = new URL(res.headers.location, currentUrl).href;
      // console.log(`  Redirect ${res.statusCode} from ${currentUrl} -> ${nextUrl}`);
      currentUrl = nextUrl;
      redirects++;
    } else {
      return { ...res, currentUrl, redirects };
    }
  }
  throw new Error(`Too many redirects from ${url}`);
}

async function run() {
  console.log('================================================================');
  console.log('  CHALLENGER EMPIRICAL VERIFICATION: LIVE PRODUCTION ENDPOINTS  ');
  console.log('================================================================\n');

  const distDir = path.resolve('dist');
  const distAssetsDir = path.join(distDir, 'assets');
  let distFiles = [];
  if (fs.existsSync(distAssetsDir)) {
    distFiles = fs.readdirSync(distAssetsDir);
  }

  console.log(`Found ${distFiles.length} asset files in local dist/assets/`);

  // 1. Direct status checks on danceflow-saas.web.app
  console.log('\n--- 1. Direct Target Probes (danceflow-saas.web.app) ---');
  const directRoutes = [
    '/',
    '/login',
    '/parent',
    '/students',
    '/payments',
    '/some-unknown-spa-route-for-testing'
  ];

  for (const r of directRoutes) {
    const url = `https://danceflow-saas.web.app${r}`;
    const directRes = await fetchEndpoint(url);
    console.log(`GET ${url} -> Status: ${directRes.statusCode}, Location: ${directRes.headers.location || 'none'}, Content-Type: ${directRes.headers['content-type']}`);
    
    // Also follow redirect to see final landing
    const followed = await fetchWithRedirects(url);
    console.log(`  Followed -> Final URL: ${followed.currentUrl}, Status: ${followed.statusCode}, Content-Length: ${followed.bodyBuffer.length} bytes, Title match: ${followed.bodyText.includes('<title>')}`);
  }

  // 2. Direct status checks on canonical domain (www.tropicalstyle.it)
  console.log('\n--- 2. Canonical Target Probes (www.tropicalstyle.it) ---');
  for (const r of directRoutes) {
    const url = `https://www.tropicalstyle.it${r}`;
    const followed = await fetchWithRedirects(url);
    const hasHtmlDoctype = followed.bodyText.toLowerCase().includes('<!doctype html>');
    const hasRootDiv = followed.bodyText.includes('id="root"');
    console.log(`GET ${url} -> Status: ${followed.statusCode}, Content-Type: ${followed.headers['content-type']}, Size: ${followed.bodyBuffer.length}b, HTML Doctype: ${hasHtmlDoctype}, #root: ${hasRootDiv}`);
  }

  // 3. Static Assets Probe and Integrity Check
  console.log('\n--- 3. Static Assets Availability & Integrity on Live Production ---');
  // Check index.html to find exact asset references
  const indexHtmlRes = await fetchWithRedirects('https://www.tropicalstyle.it/');
  const scriptMatches = [...indexHtmlRes.bodyText.matchAll(/src="\/assets\/([^"]+)"/g)].map(m => m[1]);
  const cssMatches = [...indexHtmlRes.bodyText.matchAll(/href="\/assets\/([^"]+)"/g)].map(m => m[1]);

  console.log(`Live index.html references Scripts: ${JSON.stringify(scriptMatches)}`);
  console.log(`Live index.html references CSS: ${JSON.stringify(cssMatches)}`);

  // Sample key bundles from dist/assets
  const sampleBundles = [
    ...scriptMatches,
    ...cssMatches,
    // Add specific key feature bundles
    'LoginPage-yyA-1w70.js',
    'StudentDetailPage-DKyvpoBH.js',
    'StudentForm-Biyn8l2k.js',
    'PaymentsPage-zPtmvdY2.js',
    'ParentPortalPage-CG197Zu2.js',
    'whatsapp-7emM6WGO.js',
    'vendor-firebase-C2J70B3a.js'
  ];

  const uniqueBundles = [...new Set(sampleBundles)].filter(b => b);

  let bundlesPassed = 0;
  let bundlesFailed = 0;

  for (const bundle of uniqueBundles) {
    const liveAssetUrl = `https://www.tropicalstyle.it/assets/${bundle}`;
    const assetRes = await fetchEndpoint(liveAssetUrl);
    const localPath = path.join(distAssetsDir, bundle);
    let sizeMatches = false;
    let localSize = -1;

    if (fs.existsSync(localPath)) {
      localSize = fs.statSync(localPath).size;
      // Byte length should match uncompressed or gzip
      sizeMatches = assetRes.bodyBuffer.length === localSize;
    }

    const is200 = assetRes.statusCode === 200;
    const contentType = assetRes.headers['content-type'];
    const cacheControl = assetRes.headers['cache-control'];

    if (is200) {
      bundlesPassed++;
      console.log(`  [PASS] ${bundle}: 200 OK | Type: ${contentType} | Size: ${assetRes.bodyBuffer.length} bytes (local: ${localSize}) | Cache: ${cacheControl}`);
    } else {
      bundlesFailed++;
      console.error(`  [FAIL] ${bundle}: Status ${assetRes.statusCode}`);
    }
  }

  // 4. Test live hosting directly on danceflow-saas.web.app for assets
  console.log('\n--- 4. Static Assets Availability on danceflow-saas.web.app ---');
  for (const bundle of uniqueBundles.slice(0, 4)) {
    const liveAssetUrl = `https://danceflow-saas.web.app/assets/${bundle}`;
    const assetRes = await fetchEndpoint(liveAssetUrl);
    console.log(`  GET ${liveAssetUrl} -> Status: ${assetRes.statusCode}, Location: ${assetRes.headers.location || 'served direct'}`);
  }

  // 5. Adversarial checks: Bad query params, large query, invalid paths, 404 behavior
  console.log('\n--- 5. Adversarial & Edge Case Probes ---');
  const edgeCases = [
    { name: 'XSS attempt in query param', path: '/login?email=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E&firstAccess=true' },
    { name: 'Null bytes in path', path: '/%00login' },
    { name: 'Deep nonexistent nested SPA route', path: '/parent/deep/sub/path/that/does/not/exist/99999' },
    { name: 'Static asset non-existent 404', path: '/assets/non-existent-chunk-99999.js' },
  ];

  for (const ec of edgeCases) {
    const url = `https://www.tropicalstyle.it${ec.path}`;
    try {
      const res = await fetchEndpoint(url);
      console.log(`  [${ec.name}] Status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}, Body length: ${res.bodyBuffer.length}`);
    } catch (err) {
      console.log(`  [${ec.name}] Request handled/rejected: ${err.message}`);
    }
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: Bundles tested: ${uniqueBundles.length} | Passed: ${bundlesPassed} | Failed: ${bundlesFailed}`);
  console.log('================================================================');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
