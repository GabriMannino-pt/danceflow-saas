const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const targetUrl = 'https://danceflow-saas.web.app';
const testEmail = `owner-mobile-${Date.now()}@example.com`;
const testPassword = 'Password123!';

const screenshotsDir = 'c:/Users/f3d3r/Downloads/files/danceflow/screenshots';
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  console.log('Avvio test di verifica layout mobile...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Emula iPhone 12/13/14 Pro Viewport
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });

  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');

  try {
    // 1. Pagina Login
    console.log('Navigazione a login...');
    await page.goto(`${targetUrl}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"]');
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_1_login.png') });
    console.log('Screenshot login salvato.');

    // 2. Pagina Registrazione
    console.log('Navigazione a registrazione...');
    const registerLink = await page.$('a[href="/register"]');
    await registerLink.click();
    await page.waitForSelector('input[name="schoolName"]');
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_2_register.png') });

    // Compila registrazione
    console.log('Compilazione form registrazione...');
    await page.type('input[name="schoolName"]', 'Scuola Mobile Test');
    await page.type('input[name="referentName"]', 'Referente Mobile');
    await page.type('input[name="email"]', testEmail);
    await page.type('input[name="password"]', testPassword);
    await page.type('input[name="confirmPassword"]', testPassword);
    await page.click('button[type="submit"]');

    // 3. Attesa Onboarding
    console.log('Attesa caricamento onboarding Step 1...');
    await page.waitForSelector('input[placeholder="Es. Accademia delle Arti"]', { timeout: 15000 });
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_3_onboarding_step1.png') });

    // Compila Step 1
    await page.type('input[placeholder="Es. Accademia delle Arti"]', 'Scuola Mobile Test');
    await page.type('input[placeholder="Es. 06 1234567"]', '3331234567');
    await page.type('input[placeholder="Es. Roma"]', 'Napoli');
    await page.type('input[placeholder="Es. Via della Danza, 12"]', 'Corso Vittorio Emanuele 10');
    
    // Clicca "Avanti"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent.includes('Avanti'));
      if (nextBtn) nextBtn.click();
    });

    // Step 2 (Aule)
    console.log('Attesa onboarding Step 2...');
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_4_onboarding_step2.png') });
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent.includes('Avanti'));
      if (nextBtn) nextBtn.click();
    });

    // Step 3 (Primo Corso)
    console.log('Attesa onboarding Step 3...');
    await new Promise(r => setTimeout(r, 2000));
    await page.waitForSelector('input[placeholder="Es. Hip Hop Principianti Lunedì"]', { timeout: 10000 });
    await page.type('input[placeholder="Es. Hip Hop Principianti Lunedì"]', 'Danza Classica Bimbi');
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_5_onboarding_step3.png') });
    
    // Completa configurazione
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const completeBtn = btns.find(b => b.textContent.includes('Completa Configurazione'));
      if (completeBtn) completeBtn.click();
    });

    // 4. Redirect a Dashboard
    console.log('Attesa caricamento Dashboard...');
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_6_dashboard.png') });

    // Verifica la Bottom Tab Bar
    const tabInfo = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
      if (!nav) return { count: 0, items: [], visible: false };
      
      const links = Array.from(nav.querySelectorAll('a'));
      const items = links.map(l => {
        const labelEl = l.querySelector('span:nth-child(2)');
        return {
          href: l.getAttribute('href'),
          label: labelEl ? labelEl.textContent.trim() : ''
        };
      });

      // Controlla z-index
      const computedStyle = window.getComputedStyle(nav);
      return {
        count: links.length,
        items,
        visible: computedStyle.display !== 'none',
        zIndex: computedStyle.zIndex,
        position: computedStyle.position
      };
    });

    console.log('--- Risultati Analisi Bottom Tab Bar Mobile ---');
    console.log(`Visibile: ${tabInfo.visible}`);
    console.log(`Numero Voci: ${tabInfo.count}`);
    console.log(`Z-Index: ${tabInfo.zIndex}`);
    console.log(`Posizionamento: ${tabInfo.position}`);
    console.log('Voci rilevate:', tabInfo.items);
    console.log('------------------------------------------------');

    if (tabInfo.count !== 5) {
      throw new Error(`Errore: la Bottom Tab Bar deve contenere esattamente 5 voci, ne sono state trovate: ${tabInfo.count}`);
    }
    if (tabInfo.zIndex !== '50') {
      throw new Error(`Errore: lo z-index della Bottom Tab Bar è ${tabInfo.zIndex}, invece di 50`);
    }

    // Naviga ad Allievi
    console.log('Navigazione a pagina Allievi via Bottom Tab...');
    await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
      const links = Array.from(nav.querySelectorAll('a'));
      const allieviLink = links.find(l => l.textContent.includes('Allievi'));
      if (allieviLink) allieviLink.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_7_students.png') });

    // Naviga a Corsi
    console.log('Navigazione a pagina Corsi via Bottom Tab...');
    await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
      const links = Array.from(nav.querySelectorAll('a'));
      const corsiLink = links.find(l => l.textContent.includes('Corsi'));
      if (corsiLink) corsiLink.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_8_courses.png') });

    console.log('Verifica mobile completata con SUCCESSO!');
  } catch (error) {
    console.error('Si è verificato un errore nel test mobile:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile_error_crash.png') });
  } finally {
    await browser.close();
    console.log('Test terminati.');
  }
})();
