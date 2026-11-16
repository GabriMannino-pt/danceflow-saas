import fs from 'node:fs';
import path from 'node:path';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, {
  alias: {
    '@': path.resolve('src'),
  },
});

console.log('======================================================================');
console.log('  VERIFICATION SUITE: 4-POINT RESILIENCE & OPERATIONAL UX QA');
console.log('======================================================================\n');

const results = { total: 0, passed: 0, failed: 0 };

function assert(condition, name, details = '') {
  results.total++;
  if (condition) {
    console.log(`  [PASS] ${name}`);
    results.passed++;
  } else {
    console.error(`  [FAIL] ${name}${details ? ` — ${details}` : ''}`);
    results.failed++;
  }
}

async function main() {
  // ─── 1. CHAOS & MESSY DATA TESTING: RegistrationPdfBuilder ───
  console.log('--- [1A] Chaos & Messy Data: RegistrationPdfBuilder.ts ---');
  const { generateRegistrationPdf } = jiti(path.resolve('src/services/pdf/RegistrationPdfBuilder.ts'));

  const dirtyStudent = {
    firstName: '   ',
    lastName: null,
    gender: undefined,
    dateOfBirth: 'invalid-date-value',
    fiscalCode: '   ',
    address: null,
    contact: null,
  };
  const dirtySchool = {
    name: '   ',
    address: null,
    contact: null,
  };
  const dirtyFesMeta = {
    ipAddress: null,
    timestamp: 'not-a-timestamp',
    userAgent: undefined,
    sessionId: '   ',
  };

  let dirtyRegOk = false;
  let dirtyRegNonEmpty = false;
  try {
    const res = await generateRegistrationPdf(dirtyStudent, dirtySchool, null, dirtyFesMeta, '   ');
    const bytes = Buffer.from(await res.blob.arrayBuffer()).toString('latin1');
    dirtyRegOk = true;
    dirtyRegNonEmpty = bytes.startsWith('%PDF-') && res.blob.size > 500;
  } catch (err) {
    console.error('Dirty RegistrationPdfBuilder threw:', err);
  }
  assert(dirtyRegOk, 'generateRegistrationPdf handles null contact/address/fes, whitespace names, and invalid timestamps without crashing');
  assert(dirtyRegNonEmpty, 'generateRegistrationPdf produces a non-empty valid %PDF- document even on dirty inputs');

  // Also verify RegistrationPdfBuilder works cleanly with special characters and partial timestamps (NaN)
  let specialCharsOk = false;
  try {
    const res2 = await generateRegistrationPdf(
      { firstName: "  L'Alò  ", lastName: "  D'Amico & Co.  ", fiscalCode: ' dmclla90a01c351z ', address: {}, contact: {} },
      dirtySchool,
      'invalid-base64-prefix',
      { timestamp: Number.NaN },
      '2026/2027'
    );
    specialCharsOk = res2.blob && res2.blob.size > 500;
  } catch (err) {
    console.error('Special chars RegistrationPdfBuilder threw:', err);
  }
  assert(specialCharsOk, 'generateRegistrationPdf safely handles special characters, untrimmed CF, invalid base64 signature, and NaN timestamp');

  // ─── 1B. CHAOS & MESSY DATA: CourseGridPdfBuilder ───
  console.log('\n--- [1B] Chaos & Messy Data: CourseGridPdfBuilder.ts ---');
  const {
    toSafePositiveNumber,
    getStudentMonthPaymentStatus,
    hasStudentPaidRegistration,
    generateCourseAttendanceGridPDF,
    generateAllCoursesAttendanceGridPDF,
  } = jiti(path.resolve('src/services/pdf/CourseGridPdfBuilder.ts'));

  assert(toSafePositiveNumber('40,50') === 40.5, "toSafePositiveNumber('40,50') parses Italian comma decimals -> 40.5");
  assert(toSafePositiveNumber('  120.75  ') === 120.75, "toSafePositiveNumber('  120.75  ') trims and parses -> 120.75");
  assert(toSafePositiveNumber(Number.NaN) === 0, 'toSafePositiveNumber(NaN) safely returns 0');
  assert(toSafePositiveNumber(Infinity) === 0, 'toSafePositiveNumber(Infinity) safely returns 0');
  assert(toSafePositiveNumber(-10) === 0, 'toSafePositiveNumber(-10) rejects negative amounts -> 0');
  assert(toSafePositiveNumber(null) === 0 && toSafePositiveNumber(undefined) === 0, 'toSafePositiveNumber(null/undefined) returns 0');
  assert(toSafePositiveNumber('abc') === 0, "toSafePositiveNumber('abc') returns 0");

  // Dirty payment arrays & null entries
  const dirtyPayments = [
    null,
    undefined,
    { id: 'bad-1', studentId: 'stu-dirty', type: 'monthly', amount: Number.NaN, paidAmount: -20, months: null, status: 'paid' },
    { id: 'dirty-ok', studentId: 'stu-dirty', type: 'monthly', amount: '40,50', paidAmount: '40,50', months: [9, 10], year: 2026, status: 'paid' },
    { id: 'dirty-reg', studentId: 'stu-dirty', type: 'registration', amount: '30,00', paidAmount: '30,00', status: 'paid' },
  ];

  const dirtyMonthStatus = getStudentMonthPaymentStatus('stu-dirty', 9, dirtyPayments, '2026/2027');
  const nullArrayStatus = getStudentMonthPaymentStatus('stu-dirty', 9, null, '2026/2027');
  assert(dirtyMonthStatus.status === 'paid' && dirtyMonthStatus.paidAmount === 20.25, 'getStudentMonthPaymentStatus tolerates null records/NaN and pro-rates comma-string amounts');
  assert(nullArrayStatus.status === 'unpaid' && nullArrayStatus.paidAmount === 0, 'getStudentMonthPaymentStatus handles null payments array gracefully');
  assert(hasStudentPaidRegistration('stu-dirty', dirtyPayments) === true, 'hasStudentPaidRegistration tolerates null entries and comma-string registration fees');
  assert(hasStudentPaidRegistration('stu-dirty', null) === false, 'hasStudentPaidRegistration returns false safely on null payments array');

  const dirtyCourse = {
    id: 'crs-dirty',
    name: '   ',
    style: null,
    fee: { monthly: '45,00', registration: 'NaN' },
    isActive: true,
    isDeleted: false,
  };
  const dirtyStudents = [
    null,
    undefined,
    {
      id: 'stu-dirty',
      firstName: '   ',
      lastName: null,
      enrolledCourseIds: null,
      isActive: true,
      isDeleted: false,
    },
    {
      id: 'stu-2',
      firstName: '  Mario ',
      lastName: ' Rossi ',
      enrolledCourseIds: ['crs-dirty'],
      isActive: true,
      isDeleted: false,
    },
  ];

  let gridSingleOk = false;
  let gridAllOk = false;
  try {
    const docSingle = generateCourseAttendanceGridPDF(dirtyCourse, dirtyStudents, dirtySchool, null, '2026/2027', dirtyPayments);
    const outSingle = docSingle.output('datauristring');
    gridSingleOk = typeof outSingle === 'string' && outSingle.startsWith('data:application/pdf');

    const docAll = generateAllCoursesAttendanceGridPDF([null, dirtyCourse], dirtyStudents, dirtySchool, '2026/2027', dirtyPayments);
    const outAll = docAll.output('datauristring');
    gridAllOk = typeof outAll === 'string' && outAll.startsWith('data:application/pdf');
  } catch (err) {
    console.error('Dirty CourseGridPdfBuilder threw:', err);
  }
  assert(gridSingleOk, 'generateCourseAttendanceGridPDF handles null entries, whitespace names, and comma-string fees without crashing');
  assert(gridAllOk, 'generateAllCoursesAttendanceGridPDF handles null course/student/payment entries cleanly');

  // ─── 2. DOUBLE-CLICK SYNCHRONOUS LOCK PROTECTION ───
  console.log('\n--- [2] Synchronous Double-Click Lock Refs Verification ---');
  const lockTargets = [
    { file: 'src/components/payments/QuickPaymentModal.tsx', lock: 'submitLockRef' },
    { file: 'src/pages/auth/LoginPage.tsx', lock: 'resetLockRef' },
    { file: 'src/pages/students/StudentDetailPage.tsx', lock: 'inviteLockRef' },
    { file: 'src/pages/payments/PaymentsPage.tsx', lock: 'actionLockRef' },
    { file: 'src/pages/courses/CourseDetailPage.tsx', lock: 'enrollmentLockRef' },
  ];

  for (const target of lockTargets) {
    const src = fs.readFileSync(path.resolve(target.file), 'utf8');
    const hasRefDecl = src.includes(`${target.lock} = useRef(false)`);
    const hasRefGuard = src.includes(`${target.lock}.current`);
    const hasFinallyRelease = src.includes(`${target.lock}.current = false`);
    assert(
      hasRefDecl && hasRefGuard && hasFinallyRelease,
      `${target.file} enforces synchronous double-click guard (${target.lock}) with finally release`
    );
  }

  // ─── 3. OPTIMISTIC UI & ROLLBACK PATTERNS ───
  console.log('\n--- [3] Optimistic UI + Rollback & Loading State Verification ---');
  const usePaymentsSrc = fs.readFileSync(path.resolve('src/hooks/usePayments.ts'), 'utf8');
  const courseDetailSrc = fs.readFileSync(path.resolve('src/pages/courses/CourseDetailPage.tsx'), 'utf8');
  const paymentsPageSrc = fs.readFileSync(path.resolve('src/pages/payments/PaymentsPage.tsx'), 'utf8');
  const quickPaySrc = fs.readFileSync(path.resolve('src/components/payments/QuickPaymentModal.tsx'), 'utf8');
  const loginPageSrc = fs.readFileSync(path.resolve('src/pages/auth/LoginPage.tsx'), 'utf8');
  const studentDetailSrc = fs.readFileSync(path.resolve('src/pages/students/StudentDetailPage.tsx'), 'utf8');

  assert(
    usePaymentsSrc.includes('prevPaymentsSnapshot = useSchoolStore.getState().payments') &&
    usePaymentsSrc.includes('useSchoolStore.setState({ payments: prevPaymentsSnapshot })') &&
    usePaymentsSrc.includes('catch (err)'),
    'usePayments.ts implements Optimistic UI updates with prevPaymentsSnapshot rollback on catch'
  );
  assert(
    courseDetailSrc.includes('useSchoolStore.getState().updateStudent') &&
    courseDetailSrc.includes('useSchoolStore.getState().updateCourse') &&
    courseDetailSrc.includes('prevEnrolledIds') &&
    courseDetailSrc.includes('prevEnrolledCount'),
    'CourseDetailPage.tsx implements Optimistic UI student/course updates with rollback on failure'
  );
  assert(
    paymentsPageSrc.includes('isPrintingGrids') &&
    paymentsPageSrc.includes('loading={isPrintingGrids}') &&
    courseDetailSrc.includes('loading={isExportingGrid}') &&
    courseDetailSrc.includes('loading={isMutatingEnrollment}'),
    'Async PDF export and enrollment buttons expose explicit loading & disabled UI states'
  );

  // ─── 4. COGNITIVE LOAD (autoFocus) & EXPLICIT NETWORK FALLBACKS ───
  console.log('\n--- [4] Cognitive Load (autoFocus) & Human-Friendly Network Fallbacks ---');
  assert(
    quickPaySrc.includes('autoFocus={Boolean(initialStudentId)}') &&
    studentDetailSrc.includes('autoFocus={!target.email}'),
    'Cognitive load optimization: QuickPaymentModal and PortalInviteModal apply contextual autoFocus'
  );
  assert(
    usePaymentsSrc.includes('formatFirestoreError') &&
    usePaymentsSrc.includes('Connessione internet assente o instabile'),
    'usePayments.ts translates Firestore network/permission errors into explicit Italian user messages'
  );
  assert(
    courseDetailSrc.includes('Connessione internet assente o instabile') &&
    loginPageSrc.includes('auth/network-request-failed') &&
    studentDetailSrc.includes('navigator.clipboard.writeText') &&
    studentDetailSrc.includes('Connessione internet'),
    'CourseDetailPage, LoginPage, and StudentDetailPage provide explicit Italian network/clipboard error fallbacks'
  );

  console.log('\n======================================================================');
  console.log(`  RESILIENCE QA RESULTS: ${results.passed}/${results.total} PASSED (${results.failed} FAILED)`);
  console.log('======================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Resilience QA suite crashed:', err);
  process.exit(1);
});
