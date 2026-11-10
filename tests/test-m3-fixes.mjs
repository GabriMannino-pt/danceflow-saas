import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, name, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${name}${details ? ': ' + details : ''}`);
    failedTests++;
  }
}

console.log('======================================================');
console.log('M3 FIXES VERIFICATION: REVIEWER_M3_2 REMEDIATION TEST');
console.log('======================================================\n');

// 1. Static AST / Content Inspection
console.log('--- 1. Static Code Analysis ---');
const servicePath = path.resolve('src/services/portalInviteService.ts');
const serviceSource = fs.readFileSync(servicePath, 'utf8');

assert(
  serviceSource.includes("where('schoolId', '==', schoolId)"),
  'users query includes where("schoolId", "==", schoolId)'
);
assert(
  serviceSource.includes('const BATCH_SIZE = 400;'),
  'batch payment updates uses BATCH_SIZE = 400'
);
assert(
  serviceSource.includes('signOut(inviteAuth)'),
  'calls signOut(inviteAuth) in finally'
);
assert(
  /finally\s*\{\s*try\s*\{\s*await\s+signOut\(inviteAuth\)/.test(serviceSource),
  'signOut(inviteAuth) is wrapped in try/catch block inside finally'
);

const detailPath = path.resolve('src/pages/students/StudentDetailPage.tsx');
const detailSource = fs.readFileSync(detailPath, 'utf8');

assert(
  detailSource.includes('{!isTeacher && (') && detailSource.includes('📱 Invia Credenziali Portale'),
  'StudentDetailPage header hides portal invite button from teachers'
);
assert(
  detailSource.includes('onOpenPortalInvite={!isTeacher ? () => setIsPortalInviteOpen(true) : undefined}'),
  'StudentDetailPage AnagraficaTab hides portal invite action from teachers'
);

// 2. Behavioral Unit Testing
console.log('\n--- 2. Behavioral Tests for portalInviteService.ts ---');

const transpiledService = ts.transpileModule(serviceSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Test 2.1: Payment batch chunking with 950 payments
console.log('Testing payment batch chunking (>500 payments)...');
{
  const committedBatches = [];
  const mockPayments = [];
  for (let i = 0; i < 950; i++) {
    mockPayments.push({
      id: `pay-${i}`,
      data: () => ({ parentId: 'old-parent-id' }),
      ref: { id: `pay-${i}` },
    });
  }

  const dummyFirebaseChunkTest = {
    initializeApp: () => ({}),
    getApps: () => [],
    getAuth: () => ({}),
    createUserWithEmailAndPassword: async () => ({ user: { uid: 'uid-chunk-test' } }),
    signOut: async () => {},
    collection: () => ({ withConverter: () => ({}) }),
    doc: () => ({ withConverter: () => ({ id: 'mock-doc' }) }),
    getDocs: async (q) => {
      // payments query
      return { empty: false, docs: mockPayments };
    },
    getDoc: async () => ({ exists: () => false }),
    query: () => ({}),
    where: () => ({}),
    setDoc: async () => {},
    updateDoc: async () => {},
    writeBatch: () => {
      const ops = [];
      return {
        update: (ref, data) => ops.push({ ref, data }),
        commit: async () => {
          if (ops.length > 500) {
            throw new Error(`FirebaseError: Maximum 500 writes allowed per batch (attempted: ${ops.length})`);
          }
          committedBatches.push(ops.length);
        },
      };
    },
    auth: {},
    db: {},
    firebaseConfig: {},
    COLLECTIONS: {
      users: 'users',
      students: () => 'students',
      payments: () => 'payments',
    },
    studentConverter: {},
    paymentConverter: {},
    nowTimestamp: () => ({ seconds: 123456 }),
  };

  const serviceMod = {};
  new Function('require', 'exports', transpiledService)(() => dummyFirebaseChunkTest, serviceMod);

  const testStudent = {
    id: 'st-chunk',
    firstName: 'Test',
    lastName: 'Chunk',
    contact: { parentEmail: 'chunk@test.it' },
  };

  const result = await serviceMod.provisionAndLinkPortalAccount({
    student: testStudent,
    schoolId: 'OFLsxTdw5F2aHEvlj1RU',
    targetEmail: 'chunk@test.it',
    recipientName: 'Test Chunk',
  });

  assert(result.linkedPaymentsCount === 950, 'All 950 payments were processed');
  assert(committedBatches.length === 3, 'Committed in 3 separate batches');
  assert(committedBatches[0] === 400, 'First batch size is 400');
  assert(committedBatches[1] === 400, 'Second batch size is 400');
  assert(committedBatches[2] === 150, 'Third batch size is 150');
  assert(committedBatches.every((sz) => sz <= 400), 'No batch exceeded 400 operations');
}

// Test 2.2: SignOut error tolerance in finally block
console.log('Testing signOut error tolerance...');
{
  let signOutAttempted = false;
  const dummyFirebaseSignOutErr = {
    initializeApp: () => ({}),
    getApps: () => [],
    getAuth: () => ({}),
    createUserWithEmailAndPassword: async () => ({ user: { uid: 'uid-signout-test' } }),
    signOut: async () => {
      signOutAttempted = true;
      throw new Error('Network error during secondary signOut');
    },
    collection: () => ({ withConverter: () => ({}) }),
    doc: () => ({ withConverter: () => ({ id: 'mock-doc' }) }),
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
    COLLECTIONS: {
      users: 'users',
      students: () => 'students',
      payments: () => 'payments',
    },
    studentConverter: {},
    paymentConverter: {},
    nowTimestamp: () => ({ seconds: 123456 }),
  };

  const serviceMod = {};
  new Function('require', 'exports', transpiledService)(() => dummyFirebaseSignOutErr, serviceMod);

  let success = false;
  try {
    const res = await serviceMod.provisionAndLinkPortalAccount({
      student: { id: 'st-so', firstName: 'A', lastName: 'B', contact: { parentEmail: 'so@test.it' } },
      schoolId: 'OFLsxTdw5F2aHEvlj1RU',
      targetEmail: 'so@test.it',
      recipientName: 'SignOut Test',
    });
    if (res.parentUid === 'uid-signout-test') {
      success = true;
    }
  } catch (e) {
    success = false;
  }

  assert(signOutAttempted === true, 'signOut was attempted');
  assert(success === true, 'provisionAndLinkPortalAccount succeeded despite signOut network failure');
}

// Test 2.3: auth/email-already-in-use fallback cascade
console.log('Testing auth/email-already-in-use fallback cascade...');
{
  // Sub-case A: user found in users collection with schoolId
  const dummyA = {
    initializeApp: () => ({}),
    getApps: () => [],
    getAuth: () => ({}),
    createUserWithEmailAndPassword: async () => {
      const err = new Error('Email in use');
      err.code = 'auth/email-already-in-use';
      throw err;
    },
    signOut: async () => {},
    collection: () => ({ withConverter: () => ({}) }),
    doc: () => ({ withConverter: () => ({ id: 'mock-doc' }) }),
    getDocs: async (q) => {
      // Return user with schoolId
      return { empty: false, docs: [{ id: 'existing-school-user-uid', data: () => ({}) }] };
    },
    getDoc: async () => ({ exists: () => false }),
    query: () => ({}),
    where: () => ({}),
    setDoc: async () => {},
    updateDoc: async () => {},
    writeBatch: () => ({ update: () => {}, commit: async () => {} }),
    auth: {},
    db: {},
    firebaseConfig: {},
    COLLECTIONS: {
      users: 'users',
      students: () => 'students',
      payments: () => 'payments',
    },
    studentConverter: {},
    paymentConverter: {},
    nowTimestamp: () => ({ seconds: 123456 }),
  };

  const modA = {};
  new Function('require', 'exports', transpiledService)(() => dummyA, modA);
  const resA = await modA.provisionAndLinkPortalAccount({
    student: { id: 'st-a', firstName: 'A', lastName: 'A', contact: { parentEmail: 'a@a.it' } },
    schoolId: 'school-123',
    targetEmail: 'a@a.it',
    recipientName: 'A A',
  });
  assert(resA.parentUid === 'existing-school-user-uid', 'auth/email-already-in-use uses existing user in school');

  // Sub-case B: user NOT found in users collection, found in other student with same parent email
  let step = 0;
  const dummyB = {
    initializeApp: () => ({}),
    getApps: () => [],
    getAuth: () => ({}),
    createUserWithEmailAndPassword: async () => {
      const err = new Error('Email in use');
      err.code = 'auth/email-already-in-use';
      throw err;
    },
    signOut: async () => {},
    collection: () => ({ withConverter: () => ({}) }),
    doc: () => ({ withConverter: () => ({ id: 'mock-doc' }) }),
    getDocs: async () => {
      step++;
      // step 1: initial users query -> empty
      // step 2: email-in-use users query -> empty
      // step 3: other students query -> found sibling with parentId
      if (step === 3) {
        return {
          empty: false,
          docs: [{ id: 'sibling-student', data: () => ({ parentId: 'sibling-parent-uid' }) }],
        };
      }
      return { empty: true, docs: [] };
    },
    getDoc: async () => ({ exists: () => false }),
    query: () => ({}),
    where: () => ({}),
    setDoc: async () => {},
    updateDoc: async () => {},
    writeBatch: () => ({ update: () => {}, commit: async () => {} }),
    auth: {},
    db: {},
    firebaseConfig: {},
    COLLECTIONS: {
      users: 'users',
      students: () => 'students',
      payments: () => 'payments',
    },
    studentConverter: {},
    paymentConverter: {},
    nowTimestamp: () => ({ seconds: 123456 }),
  };

  const modB = {};
  new Function('require', 'exports', transpiledService)(() => dummyB, modB);
  const resB = await modB.provisionAndLinkPortalAccount({
    student: { id: 'st-b', firstName: 'B', lastName: 'B', contact: { parentEmail: 'b@b.it' } },
    schoolId: 'school-123',
    targetEmail: 'b@b.it',
    recipientName: 'B B',
  });
  assert(resB.parentUid === 'sibling-parent-uid', 'auth/email-already-in-use falls back to sibling student parentId');
}

console.log('\n======================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('======================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
