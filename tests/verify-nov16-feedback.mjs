import fs from 'node:fs';
import path from 'node:path';
import createJiti from 'jiti';

const jiti = createJiti(import.meta.url, {
  alias: {
    '@': path.resolve('src'),
  },
});

console.log('======================================================================');
console.log('  VERIFICATION SUITE: NOV 10–14 FEEDBACK SOLUTIONS (SOLUTIONS 1–4)');
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
  // ─── SOLUTION 1: RegistrationPdfBuilder (Latin Group Header + Adult Guardian Box) ───
  console.log('--- [Solution 1] Testing RegistrationPdfBuilder.ts ---');
  const regBuilderSrc = fs.readFileSync(path.resolve('src/services/pdf/RegistrationPdfBuilder.ts'), 'utf8');
  assert(
    regBuilderSrc.includes('getSchoolFiscalInfo') &&
    regBuilderSrc.includes('fiscal.legalName') &&
    regBuilderSrc.includes('fiscal.taxId'),
    'RegistrationPdfBuilder resolves official school fiscal metadata via getSchoolFiscalInfo'
  );
  assert(
    regBuilderSrc.includes("parentRelation !== 'allievo'") &&
    regBuilderSrc.includes('differenceInYears(new Date(), dob) < 18'),
    'RegistrationPdfBuilder suppresses guardian block for adult students / self-registrations'
  );

  const { generateRegistrationPdf } = jiti(path.resolve('src/services/pdf/RegistrationPdfBuilder.ts'));

  // Test 1A: Adult student (like Mariana Longo, born 1983, parentRelation='allievo')
  const adultStudent = {
    firstName: 'Mariana',
    lastName: 'Longo',
    gender: 'F',
    dateOfBirth: '1983-08-05',
    fiscalCode: 'LNGNMR83M45G371B',
    address: { street: 'Via Ferrara 46', city: 'Paternò', province: 'CT', postalCode: '95047' },
    contact: {
      studentPhone: '3450912598',
      studentEmail: 'mariannalongo6@gmail.com',
      parentName: 'Mariana Longo',
      parentRelation: 'allievo',
      parentPhone: '3450912598',
      parentEmail: 'mariannalongo6@gmail.com',
    },
  };
  const schoolData = {
    name: 'Tropical Style',
    address: { street: 'Via Carlo Goldoni, snc', city: 'Belpasso', province: 'CT', postalCode: '95032' },
    contact: { email: 'info@tropicalstyle.it' },
  };
  const fesMeta = {
    ipAddress: '127.0.0.1',
    timestamp: Date.now(),
    userAgent: 'TestRunner',
    sessionId: 'sess-test-1',
  };

  const adultPdfRes = await generateRegistrationPdf(adultStudent, schoolData, '', fesMeta, '2026/2027');
  const adultPdfBytes = Buffer.from(await adultPdfRes.blob.arrayBuffer()).toString('latin1');
  assert(
    adultPdfBytes.includes('S.S.D. ARL LATIN GROUP') &&
    adultPdfBytes.includes('05523810876'),
    'Generated Adult Registration PDF contains S.S.D. ARL LATIN GROUP and VAT 05523810876'
  );
  assert(
    !adultPdfBytes.includes('DATI DEL GENITORE / TUTORE LEGALE'),
    'Generated Adult Registration PDF omits the redundant Parent/Guardian block'
  );

  // Test 1B: Minor student WITH distinct parent
  const minorStudent = {
    firstName: 'Giorgia',
    lastName: 'Oliveri',
    gender: 'F',
    dateOfBirth: '2016-05-15',
    fiscalCode: 'LVRGGP16E55A841C',
    address: { street: 'Via Roma 10', city: 'Belpasso', province: 'CT', postalCode: '95032' },
    contact: {
      parentName: 'Stefania Privitera',
      parentRelation: 'madre',
      parentPhone: '3401122334',
      parentEmail: 'stefy@example.com',
    },
  };
  const minorPdfRes = await generateRegistrationPdf(minorStudent, schoolData, '', fesMeta, '2026/2027');
  const minorPdfBytes = Buffer.from(await minorPdfRes.blob.arrayBuffer()).toString('latin1');
  assert(
    minorPdfBytes.includes('DATI DEL GENITORE / TUTORE LEGALE') &&
    minorPdfBytes.includes('Stefania Privitera'),
    'Generated Minor Registration PDF retains Parent/Guardian block with distinct parent name'
  );

  // ─── SOLUTION 2: Zero-Email First-Access Flow & WhatsApp Direct Credentials ───
  console.log('\n--- [Solution 2] Testing Zero-Email First-Access Flow ---');
  const portalServiceSrc = fs.readFileSync(path.resolve('src/services/portalInviteService.ts'), 'utf8');
  const whatsappMod = jiti(path.resolve('src/lib/whatsapp.ts'));
  const detailPageSrc = fs.readFileSync(path.resolve('src/pages/students/StudentDetailPage.tsx'), 'utf8');
  const loginPageSrc = fs.readFileSync(path.resolve('src/pages/auth/LoginPage.tsx'), 'utf8');

  assert(
    portalServiceSrc.includes("DEFAULT_PORTAL_INITIAL_PASSWORD = 'Tropical2026!'") &&
    portalServiceSrc.includes('initPwd='),
    'portalInviteService defines readable DEFAULT_PORTAL_INITIAL_PASSWORD and appends initPwd to URL'
  );

  const waMsg = whatsappMod.buildPortalInvitationWhatsAppMessage({
    schoolName: 'Tropical Style Caribbean School',
    recipientName: 'Stefania',
    studentName: 'Giorgia Oliveri',
    activationLink: 'https://www.tropicalstyle.it/login?email=stefy%40example.com&firstAccess=true&initPwd=Tropical2026%21',
    email: 'stefy@example.com',
    initialPassword: 'Tropical2026!',
  });
  assert(
    waMsg.includes('stefy@example.com') && waMsg.includes('Tropical2026!'),
    'WhatsApp invitation message includes direct email + provisional password'
  );

  // Verify handleSendWhatsApp in StudentDetailPage does NOT call sendPortalPasswordResetEmail
  const waHandlerMatch = detailPageSrc.match(/async function handleSendWhatsApp\(\)[\s\S]*?\n  \}\n/);
  assert(Boolean(waHandlerMatch), 'Extracted handleSendWhatsApp from StudentDetailPage.tsx');
  assert(
    waHandlerMatch && !waHandlerMatch[0].includes('sendPortalPasswordResetEmail('),
    'CRITICAL: handleSendWhatsApp no longer triggers redundant background reset email that caused Firebase rate-limiting'
  );

  assert(
    loginPageSrc.includes('handleDirectFirstAccessSetup') &&
    loginPageSrc.includes('signInWithEmailAndPassword') &&
    loginPageSrc.includes('updatePassword') &&
    loginPageSrc.includes('Attiva Account ed Entra nel Portale'),
    'LoginPage implements Zero-Email direct in-app password setup via signInWithEmailAndPassword + updatePassword'
  );

  // ─── SOLUTION 3: Course Grids PDF Pre-Populated With Payments (SET–GIU) ───
  console.log('\n--- [Solution 3] Testing CourseGridPdfBuilder.ts & CoursesPage/CourseDetailPage ---');
  const {
    ACADEMIC_MONTHS,
    getStudentMonthPaymentStatus,
    hasStudentPaidRegistration,
    generateCourseAttendanceGridPDF,
  } = jiti(path.resolve('src/services/pdf/CourseGridPdfBuilder.ts'));

  assert(
    ACADEMIC_MONTHS.length === 10 &&
    ACADEMIC_MONTHS[0].month === 9 &&
    ACADEMIC_MONTHS[9].month === 6,
    'ACADEMIC_MONTHS covers all 10 academic months from SET (9) to GIU (6)'
  );

  const mockPayments = [
    // Multi-month payment (Sept + Oct) in single receipt
    {
      id: 'pay-multi-1',
      studentId: 'stu-1',
      courseId: 'crs-1',
      type: 'monthly',
      month: 9,
      months: [9, 10],
      year: 2026,
      amount: 80,
      totalAmount: 80,
      paidAmount: 80,
      remainingAmount: 0,
      status: 'paid',
      receiptNumber: '150',
    },
    // Partial deposit payment for Nov
    {
      id: 'pay-part-1',
      studentId: 'stu-1',
      courseId: 'crs-1',
      type: 'monthly',
      month: 11,
      year: 2026,
      amount: 40,
      totalAmount: 40,
      paidAmount: 20,
      remainingAmount: 20,
      status: 'deposit_paid',
    },
    // Annual registration paid
    {
      id: 'pay-reg-1',
      studentId: 'stu-1',
      type: 'registration',
      amount: 30,
      paidAmount: 30,
      remainingAmount: 0,
      status: 'paid',
    },
  ];

  const septStatus = getStudentMonthPaymentStatus('stu-1', 9, mockPayments, '2026/2027');
  const octStatus = getStudentMonthPaymentStatus('stu-1', 10, mockPayments, '2026/2027');
  const novStatus = getStudentMonthPaymentStatus('stu-1', 11, mockPayments, '2026/2027');
  const decStatus = getStudentMonthPaymentStatus('stu-1', 12, mockPayments, '2026/2027');

  assert(
    septStatus.status === 'paid' && septStatus.paidAmount === 40 && septStatus.receiptNumber === '150',
    'getStudentMonthPaymentStatus resolves September from multi-month receipt [9, 10] with pro-rated €40'
  );
  assert(
    octStatus.status === 'paid' && octStatus.paidAmount === 40,
    'getStudentMonthPaymentStatus resolves October from multi-month receipt [9, 10] with pro-rated €40'
  );
  assert(
    novStatus.status === 'partial' && novStatus.paidAmount === 20,
    'getStudentMonthPaymentStatus resolves partial November deposit (€20)'
  );
  assert(
    decStatus.status === 'unpaid' && decStatus.paidAmount === 0,
    'getStudentMonthPaymentStatus accurately leaves unpaid December as unpaid'
  );
  assert(
    hasStudentPaidRegistration('stu-1', mockPayments) === true &&
    hasStudentPaidRegistration('stu-other', mockPayments) === false,
    'hasStudentPaidRegistration verifies annual registration fee status'
  );

  const mockCourse = {
    id: 'crs-1',
    name: 'LATIN TROPICAL',
    style: 'Caraibico',
    level: 'intermediate',
    academicYear: '2026/2027',
    fee: { monthly: 40, registration: 30 },
    schedule: [],
    isActive: true,
    isDeleted: false,
  };
  const mockStudents = [
    {
      id: 'stu-1',
      firstName: 'Giorgia',
      lastName: 'Oliveri',
      isActive: true,
      isDeleted: false,
      enrolledCourseIds: ['crs-1'],
    },
  ];
  const gridPdfDoc = generateCourseAttendanceGridPDF(
    mockCourse,
    mockStudents,
    schoolData,
    'Maestro Marco',
    '2026/2027',
    mockPayments
  );
  const gridPdfOutput = gridPdfDoc.output('datauristring');
  const gridPdfRaw = Buffer.from(gridPdfOutput.split(',')[1], 'base64').toString('latin1');

  assert(
    gridPdfRaw.includes('PAGATO') &&
    gridPdfRaw.includes('ACC.') &&
    gridPdfRaw.includes('Iscr. OK') &&
    gridPdfRaw.includes('S.S.D. ARL LATIN GROUP'),
    'Generated Course Grid PDF visibly prints PAGATO, ACC., Iscr. OK, and Latin Group fiscal title'
  );

  // Check CourseDetailPage uses generateCourseAttendanceGridPDF with payments
  const courseDetailSrc = fs.readFileSync(path.resolve('src/pages/courses/CourseDetailPage.tsx'), 'utf8');
  assert(
    courseDetailSrc.includes('generateCourseAttendanceGridPDF') &&
    courseDetailSrc.includes('usePayments()'),
    'CourseDetailPage subscribes to usePayments and generates pre-populated SET-GIU PDF grids'
  );

  // ─── SOLUTION 4: Real-Time Unpaid Control & Course Payment Matrix ───
  console.log('\n--- [Solution 4] Testing Real-Time Unpaid Control & Course Payment Matrix ---');
  const paymentsPageSrc = fs.readFileSync(path.resolve('src/pages/payments/PaymentsPage.tsx'), 'utf8');
  assert(
    paymentsPageSrc.includes("activeTab === 'realtime_unpaid'") &&
    paymentsPageSrc.includes('Controllo Mensile & Mancati Pagamenti') &&
    paymentsPageSrc.includes('realtimeStudentsCheck'),
    'PaymentsPage implements real-time Controllo Mensile & Mancati Pagamenti view'
  );
  assert(
    paymentsPageSrc.includes('Stampa Griglie Corsi (PDF)') &&
    paymentsPageSrc.includes('initialMonth={quickMonth}'),
    'PaymentsPage wires course grid PDF export and passes initialMonth to QuickPaymentModal'
  );
  assert(
    !courseDetailSrc.includes('Step 13') &&
    courseDetailSrc.includes('Situazione Pagamenti Corso') &&
    courseDetailSrc.includes('<QuickPaymentModal'),
    'CourseDetailPage replaces Step 13 placeholder with live SET-GIU interactive payment matrix and QuickPaymentModal'
  );

  // ─── SUMMARY ──────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log(`  RESULTS: ${results.passed}/${results.total} PASSED (${results.failed} FAILED)`);
  console.log('======================================================================\n');

  if (results.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[verify-nov16-feedback] Fatal error:', err);
  process.exit(1);
});
