const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const targetUrl = 'https://danceflow-saas.web.app';
const testEmail = `owner-debug-${Date.now()}@example.com`;
const testPassword = 'Password123!';
const screenshotsDir = 'c:/Users/f3d3r/Downloads/files/danceflow/screenshots';

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  console.log('Avvio script di debug Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Listen to browser console logs
  page.on('console', (msg) => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    console.log(`[BROWSER PAGE ERROR] ${err.toString()}`);
  });

  try {
    // 1. Registrazione Nuova Scuola
    console.log('1. Navigazione a registrazione...');
    await page.goto(`${targetUrl}/register`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(screenshotsDir, 'debug_register_loaded.png') });
    await page.waitForSelector('input[name="schoolName"]');

    await page.type('input[name="schoolName"]', 'Scuola Debug');
    await page.type('input[name="referentName"]', 'Referente Debug');
    await page.type('input[name="email"]', testEmail);
    await page.type('input[name="password"]', testPassword);
    await page.type('input[name="confirmPassword"]', testPassword);
    await page.screenshot({ path: path.join(screenshotsDir, 'debug_register_filled.png') });
    
    console.log('Invio form registrazione...');
    await page.click('button[type="submit"]');

    // Onboarding Step 1
    console.log('Attesa onboarding step 1...');
    await new Promise(r => setTimeout(r, 6000));
    await page.screenshot({ path: path.join(screenshotsDir, 'debug_onboarding_attempt.png') });
    
    // Check current url
    console.log(`URL corrente: ${page.url()}`);
    
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('Testo visibile sulla pagina dopo submit:', pageText.slice(0, 500));

    await page.waitForSelector('input[placeholder="Es. Accademia delle Arti"]', { timeout: 15000 });
    await page.type('input[placeholder="Es. Accademia delle Arti"]', 'Scuola Debug');
    await page.type('input[placeholder="Es. 06 1234567"]', '3456789012');
    await page.type('input[placeholder="Es. Roma"]', 'Roma');
    await page.type('input[placeholder="Es. Via della Danza, 12"]', 'Via Debug 1');
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent.includes('Avanti'));
      if (nextBtn) nextBtn.click();
    });

    // Onboarding Step 2
    console.log('Attesa onboarding step 2...');
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent.includes('Avanti'));
      if (nextBtn) nextBtn.click();
    });

    // Onboarding Step 3
    console.log('Attesa onboarding step 3...');
    await new Promise(r => setTimeout(r, 2000));
    await page.waitForSelector('input[placeholder="Es. Hip Hop Principianti Lunedì"]');
    await page.type('input[placeholder="Es. Hip Hop Principianti Lunedì"]', 'Danza Moderna');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const completeBtn = btns.find(b => b.textContent.includes('Completa Configurazione'));
      if (completeBtn) completeBtn.click();
    });

    // Dashboard
    console.log('Attesa Dashboard...');
    await page.waitForSelector('h1', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // --- RIPRODUZIONE BUG 3: Modifica Corso ---
    console.log('\n--- Tentativo Riproduzione Bug 3 (Modifica Corso) ---');
    await page.goto(`${targetUrl}/courses`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Clicca sul corso
    await page.evaluate(() => {
      const card = document.querySelector('div.group');
      if (card) card.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // Clicca Modifica
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Modifica'));
      if (btn) btn.click();
    });
    
    // Attendi l'apertura del modal attendendo il selettore della descrizione
    await page.waitForSelector('textarea[name="description"]', { timeout: 10000 });

    // Cambia descrizione e salva
    await page.type('textarea[name="description"]', ' Nota descrittiva di test per Bug 3.');
    await page.screenshot({ path: path.join(screenshotsDir, 'debug_course_edit_filled.png') });
    
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Salva Modifiche'));
      if (btn) btn.click();
    });
    // Aspetta per vedere l'errore in console
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: path.join(screenshotsDir, 'debug_course_edit_submitted.png') });

    // --- RIPRODUZIONE BUG 2: Quota Personalizzata ---
    console.log('\n--- Tentativo Riproduzione Bug 2 (Quota Personalizzata) ---');
    await page.goto(`${targetUrl}/students`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Clicca Nuovo Allievo
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nuovo Allievo'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Compila allievo
    await page.type('input[name="firstName"]', 'Mario');
    await page.type('input[name="lastName"]', 'Rossi');
    await page.evaluate(() => {
      const input = document.querySelector('input[name="dateOfBirth"]');
      if (input) {
        input.value = '2015-04-12';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.type('input[name="contact.parentName"]', 'Luigi Rossi');
    await page.type('input[name="contact.parentEmail"]', 'parent-mario@example.com');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Registra Allievo'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 3000));

    // Vai alla scheda allievo (clicca sul primo della lista)
    await page.evaluate(() => {
      const row = document.querySelector('tbody tr');
      if (row) row.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // Iscrivi l'allievo al corso (vai alla tab Corsi)
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Corsi'));
      if (tab) tab.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    // Clicca Iscrivi
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Iscrive'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Vai alla tab Pagamenti allievo
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pagamenti'));
      if (tab) tab.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Imposta Quota Personalizzata a 30
    await page.type('input[placeholder="Es. 45.00"]', '30');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Salva'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // Vai a Pagamenti globali e Genera Quote
    await page.goto(`${targetUrl}/payments`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Genera Quote'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Seleziona il corso e clicca Genera
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      if (selects[0]) {
        selects[0].selectedIndex = 1;
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Genera Quote') && b.type === 'submit');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 3000));

    // Rileva l'importo mostrato in tabella
    const displayFee = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      if (rows.length > 0) {
        const text = rows[0].textContent;
        return text;
      }
      return null;
    });
    console.log(`Risultato visivo tabella pagamenti: ${displayFee}`);

    // --- RIPRODUZIONE BUG 1: Registrazione Versamento ---
    console.log('\n--- Tentativo Riproduzione Bug 1 (Registrazione Versamento) ---');
    // Clicca su 'Incassa'
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Incassa'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Clicca su 'Conferma Incasso'
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Conferma Incasso'));
      if (btn) btn.click();
    });
    // Aspetta per catturare l'errore contabile
    await new Promise(r => setTimeout(r, 3000));

    console.log('\nAnalisi terminata.');
  } catch (err) {
    console.error('Errore durante lo script di debug:', err);
    await page.screenshot({ path: path.join(screenshotsDir, 'debug_error_crash.png') });
  } finally {
    await browser.close();
  }
})();
