import https from 'node:https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Challenger-Live-Audit' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function verifyBundleContents() {
  console.log('Verifying feature signatures inside live bundles...');

  const checks = [
    {
      name: 'M1 - StudentDetailPage: Approva Certificato, Medical Clearance & Document Preview',
      url: 'https://danceflow-saas.web.app/assets/StudentDetailPage-DKyvpoBH.js',
      patterns: ['Approva Certificato', 'medicalClearance', 'openDocumentBlobUrl', 'Invia Credenziali Portale']
    },
    {
      name: 'M1 - ParentPortalPage: In Revisione & Compression',
      url: 'https://danceflow-saas.web.app/assets/ParentPortalPage-CG197Zu2.js',
      patterns: ['In Revisione', 'compressMedicalCertificate']
    },
    {
      name: 'M2 - StudentForm: Zod error toast and smooth scroll',
      url: 'https://danceflow-saas.web.app/assets/StudentForm-Biyn8l2k.js',
      patterns: ['Attenzione: compila i campi obbligatori evidenziati', 'aria-invalid', 'scrollIntoView']
    },
    {
      name: 'M3 - LoginPage: First access banner & password setup',
      url: 'https://danceflow-saas.web.app/assets/LoginPage-yyA-1w70.js',
      patterns: ['firstAccess', 'Benvenuto nel Portale Genitori & Allievi', 'Imposta Password di Accesso']
    },
    {
      name: 'M3 - WhatsApp Template: Greeting & feature highlights',
      url: 'https://danceflow-saas.web.app/assets/whatsapp-7emM6WGO.js',
      patterns: ['buildPortalInvitationWhatsAppMessage', 'ricevute fiscali', 'certificato medico', 'Tropical Style']
    },
    {
      name: 'M3 - Portal Invite Service (inside StudentDetailPage bundle): First Access & Secondary Auth',
      url: 'https://danceflow-saas.web.app/assets/StudentDetailPage-DKyvpoBH.js',
      patterns: ['PortalInviteAuth', 'firstAccess=true']
    },
    {
      name: 'M4 - PaymentsPage: Search by receipt number and edit receipt',
      url: 'https://danceflow-saas.web.app/assets/PaymentsPage-zPtmvdY2.js',
      patterns: ['Modifica Ricevuta', 'receiptNumber']
    }
  ];

  let allPassed = true;

  for (const check of checks) {
    console.log(`\nChecking: ${check.name}`);
    console.log(`URL: ${check.url}`);
    const res = await fetchUrl(check.url);
    if (res.status !== 200) {
      console.error(`  [FAIL] HTTP status ${res.status}`);
      allPassed = false;
      continue;
    }

    for (const pat of check.patterns) {
      const found = res.data.includes(pat);
      if (found) {
        console.log(`  [PASS] Found pattern: "${pat}"`);
      } else {
        console.error(`  [FAIL] Missing pattern: "${pat}"`);
        allPassed = false;
      }
    }
  }

  if (!allPassed) {
    console.error('\nOne or more bundle content checks FAILED.');
    process.exit(1);
  } else {
    console.log('\nALL 7 FEATURE MODULES CONFIRMED IN LIVE SCRIPT BUNDLES!');
  }
}

verifyBundleContents().catch(err => {
  console.error(err);
  process.exit(1);
});
