import puppeteer from 'puppeteer';

async function testLive() {
  console.log('Launching headless browser to check production...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  
  console.log('Navigating to https://danceflow-saas.web.app/login ...');
  await page.goto('https://danceflow-saas.web.app/login', { waitUntil: 'networkidle2', timeout: 30000 });
  
  const currentUrl = page.url();
  console.log('Current URL after navigation:', currentUrl);
  
  const title = await page.title();
  console.log('Page Title:', title);
  
  const hasRoot = await page.$('#root');
  console.log('Root element exists:', !!hasRoot);

  await browser.close();
  console.log('Browser test complete.');
}

testLive().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
