import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url);

console.log('================================================================');
console.log('  VERIFICATION SUITE: AURELIO FEEDBACK FIXES (AUDIO & SCREENSHOT)');
console.log('================================================================\n');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
};

function assert(condition, name, details = '') {
  results.total++;
  if (condition) {
    console.log(`  [PASS] ${name}`);
    results.passed++;
  } else {
    console.error(`  [FAIL] ${name} ${details ? `(${details})` : ''}`);
    results.failed++;
  }
}

// ─── 1. VERIFY MAIN.TSX VITE PRELOAD ERROR HANDLER ────────────────────────────
console.log('\n--- 1. Testing Stale Chunk Auto-Recovery in main.tsx ---');
const mainSource = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
assert(
  mainSource.includes("window.addEventListener('vite:preloadError'"),
  'main.tsx registers vite:preloadError event listener'
);
assert(
  mainSource.includes("sessionStorage.getItem('danceflow_chunk_reload')"),
  'main.tsx implements sessionStorage debounce against reload loops'
);
assert(
  mainSource.includes('window.location.reload()'),
  'main.tsx reloads window to fetch latest deployed chunk hashes'
);

// ─── 2. VERIFY ERRORBOUNDARY AUTO-RECOVERY ────────────────────────────────────
console.log('\n--- 2. Testing ErrorBoundary Stale Chunk Detection ---');
const errorBoundarySource = fs.readFileSync(path.resolve('src/components/ui/ErrorBoundary.tsx'), 'utf8');
assert(
  errorBoundarySource.includes('isChunkLoadError'),
  'ErrorBoundary contains isChunkLoadError helper'
);
assert(
  errorBoundarySource.includes('dynamically imported module') &&
  errorBoundarySource.includes('Loading chunk'),
  'ErrorBoundary recognizes Vite and Webpack dynamic import error messages'
);
assert(
  errorBoundarySource.includes('Aggiornamento del gestionale disponibile') &&
  errorBoundarySource.includes('Aggiorna Ora'),
  'ErrorBoundary displays user-friendly update prompt instead of confusing technical error'
);
assert(
  errorBoundarySource.includes('window.location.reload()'),
  'ErrorBoundary provides immediate reload trigger'
);

// ─── 3. VERIFY PORTAL INVITE SERVICE AUTO-SYNC CONTACTS ───────────────────────
console.log('\n--- 3. Testing PortalInviteService Contact Auto-Sync ---');
const serviceSource = fs.readFileSync(path.resolve('src/services/portalInviteService.ts'), 'utf8');
assert(
  serviceSource.includes('phone?: string') && serviceSource.includes('isMinor?: boolean'),
  'provisionAndLinkPortalAccount accepts phone and isMinor flags'
);
assert(
  serviceSource.includes('updatedContact.parentEmail = cleanEmail') &&
  serviceSource.includes('updatedContact.studentEmail = cleanEmail'),
  'provisionAndLinkPortalAccount syncs email to parent or student contact based on minor status'
);
assert(
  serviceSource.includes('updatedContact.parentPhone = cleanPhone') &&
  serviceSource.includes('updatedContact.studentPhone = cleanPhone'),
  'provisionAndLinkPortalAccount syncs phone to parent or student contact'
);
assert(
  serviceSource.includes('contact: updatedContact'),
  'provisionAndLinkPortalAccount writes updatedContact to Firestore studentRef'
);
assert(
  serviceSource.includes('updatedContact,') && serviceSource.includes('parentUid: resolvedParentUid'),
  'provisionAndLinkPortalAccount returns updatedContact in ProvisioningResult'
);

// ─── 4. VERIFY STUDENT DETAIL PAGE MODAL & DIRECT WHATSAPP FLOW ───────────────
console.log('\n--- 4. Testing StudentDetailPage Modal & Direct Action UI ---');
const detailPageSource = fs.readFileSync(path.resolve('src/pages/students/StudentDetailPage.tsx'), 'utf8');
assert(
  detailPageSource.includes('Contatti mancanti:'),
  'Modal guides user when email or phone is missing with informative helper'
);
assert(
  detailPageSource.includes('completedInvite') && detailPageSource.includes('whatsappUrl'),
  'Modal retains success state with direct action WhatsApp link'
);
assert(
  detailPageSource.includes('👉 Clicca qui per aprire la chat di WhatsApp'),
  'Modal renders unblockable anchor button for WhatsApp'
);
assert(
  detailPageSource.includes('Copia Messaggio'),
  'Modal provides Copy Message button for clipboard manual paste'
);
assert(
  detailPageSource.includes('Invia Invito su WhatsApp') && detailPageSource.includes('Invia Invito via Email'),
  'Modal uses clean professional action button labels without internal milestone codes'
);
assert(
  detailPageSource.includes('updateStudent(student.id, {') &&
  detailPageSource.includes('contact: updatedContact'),
  'StudentDetailPage updates in-memory Zustand store and local state with new contact info'
);

// ─── 5. VERIFY STUDENT FORM EDITING RESILIENCE (ZOD SCHEMA) ───────────────────
console.log('\n--- 5. Testing StudentForm Zod Schema Resilience ---');
const formSource = fs.readFileSync(path.resolve('src/components/students/StudentForm.tsx'), 'utf8');
const schemaMatch = formSource.match(/const getStudentFormSchema = \([\s\S]*?\n\s*\};\n/);
if (!schemaMatch) throw new Error('Could not find getStudentFormSchema in StudentForm.tsx');
const transpiledSchema = ts.transpileModule(schemaMatch[0], {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const getStudentFormSchema = new Function('z', 'exports', `${transpiledSchema}; return getStudentFormSchema;`)(z, {});

// Test 5A: Editing existing student with legacy medicalClearance=true without expiry
const editSchema = getStudentFormSchema(true);
const legacyStudentData = {
  firstName: 'Mario',
  lastName: 'Rossi',
  dateOfBirth: '2010-05-15',
  fiscalCode: 'RSSMRA10E15F205Z',
  gender: 'M',
  address: {},
  contact: {
    studentPhone: '3401234567',
    studentEmail: 'mario@test.it',
  },
  medicalInfo: {
    medicalClearance: true,
    medicalClearanceExpiry: '', // Empty legacy expiry!
  },
  notes: 'Allievo storico',
  isActive: true,
};

const editValidation = editSchema.safeParse(legacyStudentData);
assert(
  editValidation.success,
  'StudentForm allows editing existing student with legacy medicalClearance without expiry date',
  editValidation.error ? JSON.stringify(editValidation.error.issues) : ''
);

// Test 5B: New registration requires medical clearance expiry if clearance is true
const newSchema = getStudentFormSchema(false);
const newStudentData = {
  ...legacyStudentData,
  contact: {
    ...legacyStudentData.contact,
    parentName: 'Giuseppe Rossi',
    parentPhone: '3409876543',
    parentEmail: 'giuseppe@test.it',
    parentRelation: 'padre',
  },
  medicalInfo: {
    medicalClearance: true,
    medicalClearanceExpiry: '', // Empty on new creation
  },
};
const newValidation = newSchema.safeParse(newStudentData);
assert(
  !newValidation.success &&
  newValidation.error?.issues.some(i => i.path.includes('medicalClearanceExpiry')),
  'StudentForm strictly requires expiry date on NEW student registration when clearance is checked'
);

// Test 5C: Editing student with empty/missing date of birth does not fail
const editNoDobData = {
  ...legacyStudentData,
  dateOfBirth: '',
};
const editNoDobValidation = editSchema.safeParse(editNoDobData);
assert(
  editNoDobValidation.success,
  'StudentForm permits editing contact details on legacy student record even if dateOfBirth is blank',
  editNoDobValidation.error ? JSON.stringify(editNoDobValidation.error.issues) : ''
);

// ─── 6. VERIFY WHATSAPP MESSAGE & NUMBER FORMATTING ───────────────────────────
console.log('\n--- 6. Testing WhatsApp Integration Functions ---');
const { cleanPhoneNumber, buildPortalInvitationWhatsAppMessage } = jiti(path.resolve('src/lib/whatsapp.ts'));

const phoneClean1 = cleanPhoneNumber('340 123 4567');
assert(phoneClean1 === '393401234567', 'cleanPhoneNumber prepends 39 to standard 10-digit Italian mobile', phoneClean1);

const phoneClean2 = cleanPhoneNumber('+39 349 9876543');
assert(phoneClean2 === '393499876543', 'cleanPhoneNumber preserves international 39 prefix without duplicate', phoneClean2);

const msg = buildPortalInvitationWhatsAppMessage({
  schoolName: 'Tropical Style Caribbean School',
  recipientName: 'Aurelio',
  studentName: 'Marco Rossi',
  activationLink: 'https://danceflow-saas.web.app/login?email=test%40email.it&firstAccess=true',
});
assert(
  msg.includes('Tropical Style Caribbean School') &&
  msg.includes('Marco Rossi') &&
  msg.includes('https://danceflow-saas.web.app/login?email=test%40email.it&firstAccess=true'),
  'buildPortalInvitationWhatsAppMessage formats complete personalized invitation message'
);

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`  VERIFICATION RESULTS: ${results.passed}/${results.total} PASSED`);
if (results.failed === 0) {
  console.log('  ALL CHECKS PASSED: 100% SUCCESS!');
} else {
  console.error(`  ${results.failed} CHECKS FAILED!`);
}
console.log('================================================================\n');

if (results.failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
