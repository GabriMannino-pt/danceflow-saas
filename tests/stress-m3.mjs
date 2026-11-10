import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}${details ? ': ' + details : ''}`);
    failed++;
  }
}

console.log('======================================================');
console.log('CHALLENGER EMPIRICAL ADVERSARIAL STRESS TEST SUITE — M3');
console.log('======================================================\n');

// Load & transpile whatsapp.ts
const whatsappPath = path.resolve('src/lib/whatsapp.ts');
const whatsappSource = fs.readFileSync(whatsappPath, 'utf8');
const transpiledWhatsapp = ts.transpileModule(whatsappSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const whatsappModule = {};
new Function('exports', transpiledWhatsapp)(whatsappModule);
const { buildPortalInvitationWhatsAppMessage, cleanPhoneNumber } = whatsappModule;

// Load & transpile portalInviteService.ts
const servicePath = path.resolve('src/services/portalInviteService.ts');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const transpiledService = ts.transpileModule(serviceSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const dummyFirebase = {
  initializeApp: () => ({}),
  getApps: () => [],
  getAuth: () => ({}),
  createUserWithEmailAndPassword: async () => ({ user: { uid: 'mock-uid' } }),
  signOut: async () => {},
  sendPasswordResetEmail: async (_auth, email) => {
    if (!email || !email.includes('@')) throw new Error('Firebase: Invalid email');
  },
  collection: () => ({}),
  doc: () => ({ id: 'mock-doc-id' }),
  getDocs: async () => ({ empty: true, docs: [] }),
  getDoc: async () => ({ exists: () => false }),
  query: () => ({}),
  where: () => ({}),
  setDoc: async () => {},
  updateDoc: async () => {},
  writeBatch: () => ({ update: () => {}, commit: async () => {} }),
  auth: {},
  db: {},
  firebaseConfig: {},
  COLLECTIONS: { users: 'users', students: () => 'students', payments: () => 'payments' },
  studentConverter: {},
  paymentConverter: {},
  nowTimestamp: () => ({ seconds: 123456 }),
};

const serviceModule = {};
new Function('require', 'exports', transpiledService)(() => dummyFirebase, serviceModule);
const {
  resolvePortalTargetContact,
  buildPortalActivationUrl,
  sendPortalPasswordResetEmail,
} = serviceModule;

// ─── 1. WhatsApp Message Formatting & Encoding Stress Tests ──────────────────
console.log('--- 1. WhatsApp Message Formatting & Encoding Stress Tests ---');

// 1.1 URL encoding with complex email
const complexEmail = 'mario.rossi+dance_2026@sub.scuola-ballo.it';
const activationLink = buildPortalActivationUrl(complexEmail);
assert(
  activationLink.startsWith('https://danceflow-saas.web.app/login?email='),
  'Activation URL base matches production default domain in non-browser env'
);
assert(
  activationLink.includes('email=mario.rossi%2Bdance_2026%40sub.scuola-ballo.it'),
  'Activation URL properly encodes plus (+) and at (@) in query parameter'
);

// Round-trip parse via URL & URLSearchParams
const parsedUrl = new URL(activationLink);
assert(parsedUrl.pathname === '/login', 'URL pathname is /login');
assert(
  parsedUrl.searchParams.get('email') === 'mario.rossi+dance_2026@sub.scuola-ballo.it',
  'URLSearchParams correctly decodes full email with + and @'
);
assert(parsedUrl.searchParams.get('firstAccess') === 'true', 'firstAccess param is explicitly true');

// 1.2 Message phrasing & Italian wording
const fullMsg = buildPortalInvitationWhatsAppMessage({
  schoolName: 'Tropical Style Caribbean School',
  recipientName: 'Giovanni Bianchi',
  studentName: 'Matteo Bianchi',
  activationLink,
});

assert(fullMsg.includes('Ciao Gentile Giovanni Bianchi,'), 'Proper formal salutation with recipient name');
assert(fullMsg.includes('Tropical Style Caribbean School! 🌴✨'), 'Tropical Style school name with Caribbean icons');
assert(fullMsg.includes('Matteo Bianchi'), 'Contains exact student name');
assert(fullMsg.includes('Visualizzare e scaricare le ricevute fiscali dei pagamenti'), 'Mentions fiscal receipts feature');
assert(fullMsg.includes('Caricare o verificare il certificato medico di idoneità'), 'Mentions medical certificate feature');
assert(fullMsg.includes('Consultare orari dei corsi e registro presenze'), 'Mentions schedule and attendance feature');
assert(fullMsg.includes(activationLink), 'Contains verbatim activation link');
assert(fullMsg.includes("imposta la tua password personale riservata per completare l'attivazione"), 'Clear first-access instructions');
assert(fullMsg.includes('Lo staff di Tropical Style Caribbean School'), 'Official sign-off by school staff');

// 1.3 WhatsApp chat URL encoding test
const encodedForWaMe = encodeURIComponent(fullMsg);
const decodedFromWaMe = decodeURIComponent(encodedForWaMe);
assert(decodedFromWaMe === fullMsg, 'Full message survives encodeURIComponent / decodeURIComponent round-trip without corruption');
assert(encodedForWaMe.includes('%0A'), 'Newlines are encoded as %0A for WhatsApp URL schema');

// 1.4 Edge cases in recipient name
const msgNullRecipient = buildPortalInvitationWhatsAppMessage({
  recipientName: null,
  studentName: 'Luca',
  activationLink: 'https://example.com',
});
assert(msgNullRecipient.includes('Ciao Gentile Genitore / Allievo,'), 'Null recipientName falls back to Gentile Genitore / Allievo');

const msgEmptyRecipient = buildPortalInvitationWhatsAppMessage({
  recipientName: '',
  studentName: 'Luca',
  activationLink: 'https://example.com',
});
assert(msgEmptyRecipient.includes('Ciao Gentile Genitore / Allievo,'), 'Empty string recipientName falls back to Gentile Genitore / Allievo');

const msgWhitespaceRecipient = buildPortalInvitationWhatsAppMessage({
  recipientName: '    ',
  studentName: 'Luca',
  activationLink: 'https://example.com',
});
assert(msgWhitespaceRecipient.includes('Ciao Gentile Genitore / Allievo,'), 'Whitespace-only recipientName falls back to Gentile Genitore / Allievo');

const msgUntrimmedRecipient = buildPortalInvitationWhatsAppMessage({
  recipientName: '   Anna Verdi   ',
  studentName: 'Luca',
  activationLink: 'https://example.com',
});
assert(msgUntrimmedRecipient.includes('Ciao Gentile Anna Verdi,'), 'Untrimmed recipientName is trimmed properly in salutation');

const msgSpecialChars = buildPortalInvitationWhatsAppMessage({
  recipientName: `Jean-Luc D'Agostino & Co. <Admin>`,
  studentName: `O'Brian & Mario "Il ballerino"`,
  activationLink: 'https://example.com',
});
assert(msgSpecialChars.includes(`Gentile Jean-Luc D'Agostino & Co. <Admin>`), 'Special chars in recipient name preserved safely');
assert(msgSpecialChars.includes(`O'Brian & Mario "Il ballerino"`), 'Special chars in student name preserved safely');

// ─── 2. Phone Cleaning Edge Cases ─────────────────────────────────────────────
console.log('\n--- 2. Phone Cleaning Edge Cases ---');

assert(cleanPhoneNumber(null) === null, 'cleanPhoneNumber(null) returns null');
assert(cleanPhoneNumber(undefined) === null, 'cleanPhoneNumber(undefined) returns null');
assert(cleanPhoneNumber('') === null, 'cleanPhoneNumber("") returns null');
assert(cleanPhoneNumber('   ') === null, 'cleanPhoneNumber("   ") returns null');
assert(cleanPhoneNumber('abc') === null, 'cleanPhoneNumber with no digits returns null');
assert(cleanPhoneNumber('340 123 4567') === '393401234567', 'Normalizes mobile with spaces');
assert(cleanPhoneNumber('340-123-4567') === '393401234567', 'Normalizes mobile with hyphens');
assert(cleanPhoneNumber('+39 (340) 12.34.567') === '393401234567', 'Normalizes mobile with +39, parentheses and dots');
assert(cleanPhoneNumber('00393401234567') === '00393401234567', 'Preserves 0039 prefix');
assert(cleanPhoneNumber('+33 6 12 34 56 78') === '33612345678', 'Strips non-digits from foreign number');

// ─── 3. Contact Resolution (resolvePortalTargetContact) Stress Tests ──────────
console.log('\n--- 3. Contact Resolution Stress Tests ---');

// Case A: Minor with complete parent contact
const minorFull = {
  id: 'm1',
  firstName: 'Giorgia',
  lastName: 'Russo',
  contact: {
    studentEmail: 'giorgia@gmail.com',
    studentPhone: '3331111111',
    parentName: 'Marco Russo',
    parentEmail: 'marco.russo@gmail.com',
    parentPhone: '3402222222',
  },
};
const resMinorFull = resolvePortalTargetContact(minorFull, 16);
assert(resMinorFull.isMinor === true, 'Age 16 isMinor === true');
assert(resMinorFull.recipientName === 'Marco Russo', 'Uses parentName for minor');
assert(resMinorFull.email === 'marco.russo@gmail.com', 'Prefers parentEmail for minor');
assert(resMinorFull.phone === '3402222222', 'Prefers parentPhone for minor');

// Case B: Boundary age 17.99
const resMinorBoundary = resolvePortalTargetContact(minorFull, 17.99);
assert(resMinorBoundary.isMinor === true, 'Age 17.99 isMinor === true');

// Case C: Boundary age 18.0 (Legal adult)
const resAdultBoundary = resolvePortalTargetContact(minorFull, 18.0);
assert(resAdultBoundary.isMinor === false, 'Age 18.0 isMinor === false');
assert(resAdultBoundary.recipientName === 'Giorgia Russo', 'Age 18.0 uses student full name');
assert(resAdultBoundary.email === 'giorgia@gmail.com', 'Age 18.0 uses studentEmail');
assert(resAdultBoundary.phone === '3331111111', 'Age 18.0 uses studentPhone');

// Case D: Minor with partial parent contacts (parent email missing, student email present)
const minorPartialParent = {
  id: 'm2',
  firstName: 'Lorenzo',
  lastName: 'Conti',
  contact: {
    studentEmail: 'lorenzo@conti.it',
    parentName: 'Paolo Conti',
    parentPhone: '3487777777',
  },
};
const resMinorPartial = resolvePortalTargetContact(minorPartialParent, 14);
assert(resMinorPartial.isMinor === true, 'Minor partial isMinor === true');
assert(resMinorPartial.recipientName === 'Paolo Conti', 'Uses parentName if present');
assert(resMinorPartial.phone === '3487777777', 'Uses parentPhone');
assert(resMinorPartial.email === 'lorenzo@conti.it', 'Falls back to studentEmail when parentEmail is missing');

// Case E: Minor with missing parentName
const minorNoParentName = {
  id: 'm3',
  firstName: 'Sara',
  lastName: 'Ferrari',
  contact: {
    parentEmail: 'mamma.ferrari@example.com',
    parentPhone: '3491234567',
  },
};
const resMinorNoParentName = resolvePortalTargetContact(minorNoParentName, 8);
assert(resMinorNoParentName.recipientName === 'Genitore di Sara Ferrari', 'Generates default Genitore di FirstName LastName');

// Case F: Adult with missing student contacts, falling back to parent contacts
const adultFallback = {
  id: 'a1',
  firstName: 'Davide',
  lastName: 'Romano',
  contact: {
    parentName: 'Padre Romano',
    parentEmail: 'padre@romano.it',
    parentPhone: '3456789012',
  },
};
const resAdultFallback = resolvePortalTargetContact(adultFallback, 22);
assert(resAdultFallback.isMinor === false, 'Adult isMinor === false');
assert(resAdultFallback.recipientName === 'Davide Romano', 'Adult recipient is student name');
assert(resAdultFallback.email === 'padre@romano.it', 'Adult falls back to parentEmail if studentEmail missing');
assert(resAdultFallback.phone === '3456789012', 'Adult falls back to parentPhone if studentPhone missing');

// Case G: Empty contact object / undefined contacts
const emptyStudent = {
  id: 'empty',
  firstName: 'Allievo',
  lastName: 'SenzaContatti',
};
const resEmptyMinor = resolvePortalTargetContact(emptyStudent, 10);
assert(resEmptyMinor.isMinor === true, 'Empty contact minor isMinor === true');
assert(resEmptyMinor.email === '', 'Empty minor email is empty string');
assert(resEmptyMinor.phone === '', 'Empty minor phone is empty string');
assert(resEmptyMinor.recipientName === 'Genitore di Allievo SenzaContatti', 'Empty minor recipientName default');

const resEmptyAdult = resolvePortalTargetContact(emptyStudent, 30);
assert(resEmptyAdult.isMinor === false, 'Empty adult isMinor === false');
assert(resEmptyAdult.email === '', 'Empty adult email is empty string');
assert(resEmptyAdult.phone === '', 'Empty adult phone is empty string');
assert(resEmptyAdult.recipientName === 'Allievo SenzaContatti', 'Empty adult recipientName is student name');

// ─── 4. Activation URL Trimming & Lowercasing ─────────────────────────────────
console.log('\n--- 4. Activation URL Trimming & Lowercasing ---');

const mixedCaseUrl = buildPortalActivationUrl('   GENITORE.Test@DOMAIN.IT   ');
assert(
  mixedCaseUrl.includes('email=genitore.test%40domain.it'),
  'buildPortalActivationUrl trims whitespace and lowercases email'
);

// ─── 5. Password Reset Email Input Validation ─────────────────────────────────
console.log('\n--- 5. Password Reset Email Input Validation ---');

let caughtEmpty = false;
try {
  await sendPortalPasswordResetEmail('');
} catch (e) {
  caughtEmpty = true;
  assert(e.message === 'Indirizzo email non valido.', 'Empty email throws specific validation error');
}
assert(caughtEmpty, 'sendPortalPasswordResetEmail rejected empty email');

let caughtInvalid = false;
try {
  await sendPortalPasswordResetEmail('non-an-email');
} catch (e) {
  caughtInvalid = true;
  assert(e.message === 'Indirizzo email non valido.', 'Email without @ throws validation error');
}
assert(caughtInvalid, 'sendPortalPasswordResetEmail rejected email without @');

let caughtSpaces = false;
try {
  await sendPortalPasswordResetEmail('   ');
} catch (e) {
  caughtSpaces = true;
}
assert(caughtSpaces, 'sendPortalPasswordResetEmail rejected whitespace-only email');

// Valid email does not throw
let validSuccess = false;
try {
  await sendPortalPasswordResetEmail('valid.parent@example.com');
  validSuccess = true;
} catch (e) {
  validSuccess = false;
}
assert(validSuccess, 'sendPortalPasswordResetEmail succeeds for valid email');

console.log('\n======================================================');
console.log(`TOTAL ADVERSARIAL ASSERTIONS PASSED: ${passed}`);
console.log(`TOTAL ADVERSARIAL ASSERTIONS FAILED: ${failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
