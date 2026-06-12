const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const targetUrl = 'https://danceflow-saas.web.app';
const adminEmail = `owner-invite-${Date.now()}@example.com`;
const teacherEmail = `teacher-invite-${Date.now()}@example.com`;
const testPassword = 'Password123!';

const screenshotsDir = 'c:/Users/f3d3r/Downloads/files/danceflow/screenshots';
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  console.log('Avvio test completo di invito e onboarding Collaboratori...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

  try {
    // 1. Registra una nuova scuola per il test
    console.log('1. Registrazione nuova scuola...');
    await page.goto(`${targetUrl}/register`, { waitUntil: 'networkidle2' });
    await page.type('input[name="schoolName"]', 'Scuola Staff Test');
    await page.type('input[name="referentName"]', 'Admin Inviti');
    await page.type('input[name="email"]', adminEmail);
    await page.type('input[name="password"]', testPassword);
    await page.type('input[name="confirmPassword"]', testPassword);
    await page.click('button[type="submit"]');

    // 2. Completa Onboarding
    console.log('2. Completamento onboarding...');
    await page.waitForSelector('input[placeholder="Es. Accademia delle Arti"]', { timeout: 15000 });
    await page.type('input[placeholder="Es. Accademia delle Arti"]', 'Scuola Staff Test');
    await page.type('input[placeholder="Es. 06 1234567"]', '3401234567');
    await page.type('input[placeholder="Es. Roma"]', 'Bologna');
    await page.type('input[placeholder="Es. Via della Danza, 12"]', 'Via dell\'Invito 5');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent.includes('Avanti'));
      if (nextBtn) nextBtn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent.includes('Avanti'));
      if (nextBtn) nextBtn.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    await page.waitForSelector('input[placeholder="Es. Hip Hop Principianti Lunedì"]', { timeout: 10000 });
    await page.type('input[placeholder="Es. Hip Hop Principianti Lunedì"]', 'Danza Moderna Principianti');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const completeBtn = btns.find(b => b.textContent.includes('Completa Configurazione'));
      if (completeBtn) completeBtn.click();
    });

    // Dashboard
    console.log('3. Dashboard caricata. Navigazione a Impostazioni...');
    await page.waitForSelector('a[href="/settings"]', { timeout: 10000 });
    await page.click('a[href="/settings"]');
    await page.waitForSelector('h1');

    // Clicca Gestione Staff
    console.log('4. Apertura scheda Gestione Staff...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const staffTab = btns.find(b => b.textContent.includes('Gestione Staff'));
      if (staffTab) staffTab.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(screenshotsDir, 'staff_tab_opened.png') });

    // Aggiungi collaboratore
    console.log('5. Apertura Modale Aggiungi Collaboratore...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addBtn = btns.find(b => b.textContent.includes('Aggiungi Collaboratore'));
      if (addBtn) addBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await page.waitForSelector('input[placeholder="es. Rossella Bianchi"]');
    await page.type('input[placeholder="es. Rossella Bianchi"]', 'Rossella Bianchi');
    await page.type('input[placeholder="es. rossella@email.it"]', teacherEmail);
    // teacher is default role
    
    console.log('6. Invio form invito collaboratore...');
    await page.screenshot({ path: path.join(screenshotsDir, 'staff_modal_filled.png') });
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submitBtn = btns.find(b => b.textContent.includes('Genera Invito'));
      if (submitBtn) submitBtn.click();
    });

    // Attendi generazione link
    console.log('7. Attesa link di invito...');
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(screenshotsDir, 'staff_invite_generated.png') });

    const inviteLink = await page.evaluate(() => {
      const codeEl = document.querySelector('code');
      return codeEl ? codeEl.textContent : null;
    });
    console.log(`Link Generato Rilevato: ${inviteLink}`);
    if (!inviteLink) {
      throw new Error('Nessun link di invito trovato nella modale!');
    }

    // Logout
    console.log('8. Logout amministratore...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const closeBtn = btns.find(b => b.textContent.includes('Chiudi'));
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const logoutBtn = btns.find(b => b.textContent.includes('Logout'));
      if (logoutBtn) logoutBtn.click();
    });
    await page.waitForSelector('input[type="email"]');

    // Naviga al link di invito
    console.log(`9. Navigazione al link di invito: ${inviteLink}`);
    await page.goto(inviteLink, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[placeholder="Scegli una password sicura"]');
    await page.screenshot({ path: path.join(screenshotsDir, 'staff_join_page.png') });

    // Compila password
    console.log('10. Compilazione password e iscrizione...');
    await page.type('input[placeholder="Scegli una password sicura"]', testPassword);
    await page.type('input[placeholder="Ripeti la password"]', testPassword);
    await page.click('button[type="submit"]');

    // Attesa Dashboard
    console.log('11. Attesa reindirizzamento Dashboard Insegnante...');
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: path.join(screenshotsDir, 'teacher_dashboard.png') });

    // Verifica che l'insegnante non veda Impostazioni
    const canSeeSettings = await page.evaluate(() => {
      return document.querySelector('a[href="/settings"]') !== null;
    });
    console.log(`Insegnante vede link Impostazioni: ${canSeeSettings}`);
    if (canSeeSettings) {
      throw new Error('Errore di sicurezza: l\'insegnante ha accesso al link delle Impostazioni!');
    }

    console.log('Test di Invito ed Onboarding Staff completato con SUCCESSO!');
  } catch (error) {
    console.error('Test fallito:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'staff_test_error.png') });
  } finally {
    await browser.close();
    console.log('Fine test.');
  }
})();
