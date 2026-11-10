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
console.log('MILESTONE 3A & 3B VERIFICATION SUITE');
console.log('======================================================\n');

// 1. Test whatsapp.ts buildPortalInvitationWhatsAppMessage
console.log('--- 1. Testing src/lib/whatsapp.ts ---');
const whatsappPath = path.resolve('src/lib/whatsapp.ts');
const whatsappSource = fs.readFileSync(whatsappPath, 'utf8');

assert(whatsappSource.includes('export function buildPortalInvitationWhatsAppMessage'), 'buildPortalInvitationWhatsAppMessage is exported');

// Transpile and evaluate whatsapp.ts functions
const transpiledWhatsapp = ts.transpileModule(whatsappSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const whatsappModule = {};
new Function('exports', transpiledWhatsapp)(whatsappModule);

const { buildPortalInvitationWhatsAppMessage, cleanPhoneNumber, openWhatsAppChat } = whatsappModule;

assert(typeof buildPortalInvitationWhatsAppMessage === 'function', 'buildPortalInvitationWhatsAppMessage is a function');
assert(typeof cleanPhoneNumber === 'function', 'cleanPhoneNumber is a function');
assert(typeof openWhatsAppChat === 'function', 'openWhatsAppChat is a function');

// Test Italian phone cleaning
assert(cleanPhoneNumber('3401234567') === '393401234567', 'Clean phone adds 39 prefix for 10-digit mobile starting with 3');
assert(cleanPhoneNumber('+39 340 1234567') === '393401234567', 'Clean phone normalizes international prefix +39');
assert(cleanPhoneNumber('393401234567') === '393401234567', 'Clean phone keeps 39 prefix when already present');

// Test message generation
const sampleMsg = buildPortalInvitationWhatsAppMessage({
  schoolName: 'Tropical Style Caribbean School',
  recipientName: 'Giuseppe Rossi',
  studentName: 'Luca Rossi',
  activationLink: 'https://danceflow-saas.web.app/login?email=genitore%40email.it&firstAccess=true',
});

assert(sampleMsg.includes('Ciao Gentile Giuseppe Rossi,'), 'Contains personalized salutation');
assert(sampleMsg.includes('Tropical Style Caribbean School'), 'Contains school name');
assert(sampleMsg.includes('Luca Rossi'), 'Contains student name');
assert(sampleMsg.includes('https://danceflow-saas.web.app/login?email=genitore%40email.it&firstAccess=true'), 'Contains exact activation link');
assert(sampleMsg.includes('Primo accesso') || sampleMsg.includes('primo accesso'), 'Contains first-access instructions');
assert(sampleMsg.includes('password'), 'Contains password setup instructions');
assert(sampleMsg.includes('ricevute fiscali'), 'Lists receipts feature');
assert(sampleMsg.includes('certificato medico'), 'Lists medical clearance feature');

// 2. Test portalInviteService.ts
console.log('\n--- 2. Testing src/services/portalInviteService.ts ---');
const servicePath = path.resolve('src/services/portalInviteService.ts');
const serviceSource = fs.readFileSync(servicePath, 'utf8');

assert(serviceSource.includes('export function resolvePortalTargetContact'), 'resolvePortalTargetContact is exported');
assert(serviceSource.includes('export function buildPortalActivationUrl'), 'buildPortalActivationUrl is exported');
assert(serviceSource.includes('export async function sendPortalPasswordResetEmail'), 'sendPortalPasswordResetEmail is exported');
assert(serviceSource.includes('export async function provisionAndLinkPortalAccount'), 'provisionAndLinkPortalAccount is exported');
assert(serviceSource.includes('PortalInviteAuth'), 'Uses PortalInviteAuth secondary Firebase app name');
assert(serviceSource.includes('parentId = resolvedParentUid') || serviceSource.includes('parentId: resolvedParentUid'), 'Updates student.parentId');
assert(serviceSource.includes('linkedPaymentsCount'), 'Performs payments backfill');

// Transpile service for unit-testing pure helper functions
const transpiledService = ts.transpileModule(serviceSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Dummy firebase and converters mock for node environment
const dummyExports = {
  initializeApp: () => ({}),
  getApps: () => [],
  getAuth: () => ({}),
  createUserWithEmailAndPassword: async () => ({ user: { uid: 'mock-uid' } }),
  signOut: async () => {},
  sendPasswordResetEmail: async () => {},
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
const customRequire = (id) => {
  return dummyExports;
};

new Function('require', 'exports', transpiledService)(customRequire, serviceModule);

// Test resolvePortalTargetContact for minor (age 14)
const minorStudent = {
  id: 'st-minor',
  firstName: 'Sofia',
  lastName: 'Bianchi',
  contact: {
    studentPhone: '3331112233',
    studentEmail: 'sofia@example.com',
    parentName: 'Laura Verdi',
    parentPhone: '3405556677',
    parentEmail: 'laura.verdi@example.com',
  },
};
const minorTarget = serviceModule.resolvePortalTargetContact(minorStudent, 14);
assert(minorTarget.isMinor === true, 'Minor correctly flagged isMinor = true');
assert(minorTarget.recipientName === 'Laura Verdi', 'Minor recipient is parent name');
assert(minorTarget.email === 'laura.verdi@example.com', 'Minor email prefers parent email');
assert(minorTarget.phone === '3405556677', 'Minor phone prefers parent phone');

// Test fallback for minor when parent contacts are missing
const minorStudentWithoutParentContacts = {
  id: 'st-minor-2',
  firstName: 'Marco',
  lastName: 'Neri',
  contact: {
    studentPhone: '3339998877',
    studentEmail: 'marco.student@example.com',
  },
};
const minorFallbackTarget = serviceModule.resolvePortalTargetContact(minorStudentWithoutParentContacts, 12);
assert(minorFallbackTarget.email === 'marco.student@example.com', 'Minor fallback targets studentEmail if parentEmail is empty');
assert(minorFallbackTarget.phone === '3339998877', 'Minor fallback targets studentPhone if parentPhone is empty');

// Test resolvePortalTargetContact for adult (age 25)
const adultStudent = {
  id: 'st-adult',
  firstName: 'Alessandro',
  lastName: 'Gallo',
  contact: {
    studentPhone: '3471122334',
    studentEmail: 'alessandro.gallo@example.com',
    parentName: 'Giuseppe Gallo',
    parentPhone: '3489988776',
    parentEmail: 'parent.gallo@example.com',
  },
};
const adultTarget = serviceModule.resolvePortalTargetContact(adultStudent, 25);
assert(adultTarget.isMinor === false, 'Adult correctly flagged isMinor = false');
assert(adultTarget.recipientName === 'Alessandro Gallo', 'Adult recipient is student full name');
assert(adultTarget.email === 'alessandro.gallo@example.com', 'Adult email targets student email');
assert(adultTarget.phone === '3471122334', 'Adult phone targets student phone');

// Test activation URL builder
const actUrl = serviceModule.buildPortalActivationUrl('test.user@danceflow.it');
assert(actUrl.includes('/login?email=test.user%40danceflow.it&firstAccess=true'), 'buildPortalActivationUrl encodes email and sets firstAccess=true');

// 3. Test LoginPage.tsx integration
console.log('\n--- 3. Testing src/pages/auth/LoginPage.tsx ---');
const loginPath = path.resolve('src/pages/auth/LoginPage.tsx');
const loginSource = fs.readFileSync(loginPath, 'utf8');

assert(loginSource.includes('useSearchParams'), 'LoginPage imports and uses useSearchParams');
assert(loginSource.includes("searchParams.get('email')"), 'LoginPage parses email from searchParams');
assert(loginSource.includes("searchParams.get('firstAccess')"), 'LoginPage parses firstAccess from searchParams');
assert(loginSource.includes('Benvenuto nel Portale Genitori & Allievi!'), 'LoginPage renders welcome banner on firstAccess');
assert(loginSource.includes('Benvenuto! Imposta la tua password'), 'LoginPage personalizes password modal title on firstAccess');

// 4. Test StudentDetailPage.tsx integration
console.log('\n--- 4. Testing src/pages/students/StudentDetailPage.tsx ---');
const detailPath = path.resolve('src/pages/students/StudentDetailPage.tsx');
const detailSource = fs.readFileSync(detailPath, 'utf8');

assert(detailSource.includes('📱 Invia Credenziali Portale'), 'StudentDetailPage renders "📱 Invia Credenziali Portale" button');
assert(detailSource.includes('isPortalInviteOpen'), 'StudentDetailPage has isPortalInviteOpen modal state');
assert(detailSource.includes('<PortalInviteModal'), 'StudentDetailPage mounts PortalInviteModal');
assert(detailSource.includes('function PortalInviteModal'), 'PortalInviteModal component is defined');
assert(detailSource.includes('Invia Invito su WhatsApp') || detailSource.includes('Invia su WhatsApp'), 'PortalInviteModal has WhatsApp dispatch action');
assert(detailSource.includes('Invia Invito via Email') || detailSource.includes('Invia via Email'), 'PortalInviteModal has Email dispatch action');
assert(detailSource.includes('openWhatsAppChat'), 'PortalInviteModal calls openWhatsAppChat');
assert(detailSource.includes('sendPortalPasswordResetEmail'), 'PortalInviteModal calls sendPortalPasswordResetEmail');
assert(detailSource.includes('provisionAndLinkPortalAccount'), 'PortalInviteModal calls provisionAndLinkPortalAccount');
assert(detailSource.includes('Portale Genitori & Allievi'), 'AnagraficaTab includes Portale Genitori card');
assert(detailSource.includes('✓ Account Collegato'), 'AnagraficaTab displays connected status badge');

console.log('\n======================================================');
console.log(`TOTAL PASSED: ${passed}`);
console.log(`TOTAL FAILED: ${failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
